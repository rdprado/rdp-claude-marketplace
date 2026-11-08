// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OrdersExample.Entities;
using OrdersExample.Infrastructure.OrdersRepository;

namespace OrdersExample.Tests.Integration.Narrow;

// Narrow integration test: one integration point, the class that talks to the database, against SQLite
// in-memory (real SQL, real EF mapping). No host, no HTTP, no login. xUnit makes a new instance per test,
// so each test has its own database.
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
    public async Task FindByClientOrderIdAsync_AfterAdd_ReturnsEveryValueWithUtcDates()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "PETR4", OrderSide.Sell, 100, 37.45m, CreatedAt);
        await using (var db = NewContext())
            await new EFOrderRepository(db).AddAsync(order);

        // Act
        Order? found;
        await using (var db = NewContext())
            found = await new EFOrderRepository(db).FindByClientOrderIdAsync(order.ClientOrderId);

        // Assert
        Assert.NotNull(found);
        Assert.Equal(order.Id, found.Id);
        Assert.Equal("PETR4", found.Symbol);
        Assert.Equal(OrderSide.Sell, found.Side);
        Assert.Equal(100, found.Quantity);
        Assert.Equal(37.45m, found.Price);
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
    public async Task FindByClientOrderIdAsync_UnknownId_ReturnsNull()
    {
        // Arrange
        await using var db = NewContext();

        // Act
        var found = await new EFOrderRepository(db).FindByClientOrderIdAsync(Guid.NewGuid());

        // Assert
        Assert.Null(found);
    }

    private OrdersDbContext NewContext()
        => new(new DbContextOptionsBuilder<OrdersDbContext>().UseSqlite(_connection).Options);
}
