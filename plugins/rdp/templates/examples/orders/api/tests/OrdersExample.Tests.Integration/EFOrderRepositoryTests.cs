// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OrdersExample.Entities;
using OrdersExample.Infrastructure.OrdersRepository;

namespace OrdersExample.Tests.Integration;

// The repository against SQLite in-memory. xUnit makes a new instance per test, so each test has its own database.
public sealed class EFOrderRepositoryTests : IDisposable
{
    private static readonly DateTime CreatedAt = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);

    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public EFOrderRepositoryTests()
    {
        _connection.Open();
        using var db = NewContext();
        db.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    [Fact]
    public async Task FindAsync_AfterAdd_ReturnsEveryValueWithUtcDates()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "PETR4", OrderSide.Sell, 100, 37.45m, CreatedAt);
        await using (var db = NewContext())
            await new EFOrderRepository(db).AddAsync(order);

        // Act
        Order? found;
        await using (var db = NewContext())
            found = await new EFOrderRepository(db).FindAsync(order.Id);

        // Assert
        Assert.NotNull(found);
        Assert.Equal("PETR4", found.Symbol);
        Assert.Equal(OrderSide.Sell, found.Side);
        Assert.Equal(100, found.Quantity);
        Assert.Equal(37.45m, found.Price);
        Assert.Equal(OrderStatus.Open, found.Status);
        Assert.Equal(CreatedAt, found.CreatedAt);
        Assert.Equal(DateTimeKind.Utc, found.CreatedAt.Kind);
    }

    [Fact]
    public async Task AddAsync_WithAClientOrderIdAlreadyStored_ReturnsFalseAndStoresNothing()
    {
        // Arrange
        var clientOrderId = Guid.NewGuid();
        await using (var db = NewContext())
            await new EFOrderRepository(db).AddAsync(Order.Open(Guid.NewGuid(), clientOrderId, "PETR4", OrderSide.Buy, 1, 1m, CreatedAt));

        // Act
        bool added;
        await using (var db = NewContext())
            added = await new EFOrderRepository(db).AddAsync(Order.Open(Guid.NewGuid(), clientOrderId, "PETR4", OrderSide.Buy, 1, 1m, CreatedAt));

        // Assert
        Assert.False(added);
        await using var check = NewContext();
        Assert.Single(await new EFOrderRepository(check).ListAsync());
    }

    [Fact]
    public async Task FindByClientOrderIdAsync_ReturnsTheOrderWithThatClientOrderId()
    {
        // Arrange
        var clientOrderId = Guid.NewGuid();
        var order = Order.Open(Guid.NewGuid(), clientOrderId, "PETR4", OrderSide.Buy, 1, 1m, CreatedAt);
        await using (var db = NewContext())
            await new EFOrderRepository(db).AddAsync(order);

        // Act
        Order? found;
        await using (var db = NewContext())
            found = await new EFOrderRepository(db).FindByClientOrderIdAsync(clientOrderId);

        // Assert
        Assert.Equal(order.Id, found?.Id);
    }

    [Fact]
    public async Task UpdateAsync_CancelledOrder_IsStoredCancelled()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "VALE3", OrderSide.Buy, 1, 60m, CreatedAt);
        await using (var db = NewContext())
            await new EFOrderRepository(db).AddAsync(order);
        await using (var db = NewContext())
        {
            var repository = new EFOrderRepository(db);
            var loaded = await repository.FindAsync(order.Id);
            loaded!.Cancel(CreatedAt.AddMinutes(1));

            // Act
            await repository.UpdateAsync(loaded);
        }

        // Assert
        await using var check = NewContext();
        var stored = await new EFOrderRepository(check).FindAsync(order.Id);
        Assert.Equal(OrderStatus.Cancelled, stored?.Status);
        Assert.Equal(CreatedAt.AddMinutes(1), stored?.UpdatedAt);
    }

    [Fact]
    public async Task ListAsync_ReturnsNewestFirst()
    {
        // Arrange
        await using (var db = NewContext())
        {
            var repository = new EFOrderRepository(db);
            await repository.AddAsync(Order.Open(Guid.NewGuid(), Guid.NewGuid(), "MIDDLE", OrderSide.Buy, 1, 1m, CreatedAt.AddMinutes(1)));
            await repository.AddAsync(Order.Open(Guid.NewGuid(), Guid.NewGuid(), "OLDEST", OrderSide.Buy, 1, 1m, CreatedAt));
            await repository.AddAsync(Order.Open(Guid.NewGuid(), Guid.NewGuid(), "NEWEST", OrderSide.Buy, 1, 1m, CreatedAt.AddMinutes(2)));
        }

        // Act
        await using var read = NewContext();
        var orders = await new EFOrderRepository(read).ListAsync();

        // Assert
        Assert.Equal(["NEWEST", "MIDDLE", "OLDEST"], orders.Select(o => o.Symbol));
    }

    [Fact]
    public async Task FindAsync_UnknownId_ReturnsNull()
    {
        // Arrange
        await using var db = NewContext();

        // Act
        var found = await new EFOrderRepository(db).FindAsync(Guid.NewGuid());

        // Assert
        Assert.Null(found);
    }

    private OrdersDbContext NewContext()
        => new(new DbContextOptionsBuilder<OrdersDbContext>().UseSqlite(_connection).Options);
}
