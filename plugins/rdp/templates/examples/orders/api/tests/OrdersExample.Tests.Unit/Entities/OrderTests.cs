// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Entities;

namespace OrdersExample.Tests.Unit.Entities;

public class OrderTests
{
    private static readonly DateTime CreatedAt = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Later = new(2026, 1, 15, 12, 5, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(" petr4 ", OrderSide.Buy, 100, "37.5", true)] // the symbol is compared normalized
    [InlineData("PETR4", OrderSide.Sell, 100, "37.5", false)]
    [InlineData("PETR4", OrderSide.Buy, 101, "37.5", false)]
    [InlineData("PETR4", OrderSide.Buy, 100, "37.51", false)]
    [InlineData("VALE3", OrderSide.Buy, 100, "37.5", false)]
    public void IsSameRequest_ComparesSymbolSideQuantityAndPrice(
        string symbol, OrderSide side, int quantity, string price, bool expected)
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "PETR4", OrderSide.Buy, 100, 37.5m, CreatedAt);

        // Act
        var same = order.IsSameRequest(symbol, side, quantity, decimal.Parse(price, System.Globalization.CultureInfo.InvariantCulture));

        // Assert
        Assert.Equal(expected, same);
    }

    [Fact]
    public void Open_WithValidValues_CreatesOpenOrderWithUpperCaseSymbol()
    {
        // Arrange
        var id = Guid.Parse("11111111-1111-1111-1111-111111111111");

        // Act
        var order = Order.Open(id, Guid.NewGuid(), " petr4 ", OrderSide.Buy, 100, 37.5m, CreatedAt);

        // Assert
        Assert.Equal(id, order.Id);
        Assert.Equal("PETR4", order.Symbol);
        Assert.Equal(OrderSide.Buy, order.Side);
        Assert.Equal(100, order.Quantity);
        Assert.Equal(37.5m, order.Price);
        Assert.Equal(OrderStatus.Open, order.Status);
        Assert.True(order.CanEdit);
        Assert.True(order.CanCancel);
        Assert.Equal(CreatedAt, order.CreatedAt);
        Assert.Equal(CreatedAt, order.UpdatedAt);
    }

    [Theory]
    [InlineData("", 1, 1)]
    [InlineData("TOOLONGSYMBOL", 1, 1)]
    [InlineData("PETR4", 0, 1)]
    [InlineData("PETR4", 1, 0)]
    public void Open_WithInvalidValues_Throws(string symbol, int quantity, int price)
    {
        // Arrange
        var id = Guid.NewGuid();

        // Act
        var open = () => Order.Open(id, Guid.NewGuid(), symbol, OrderSide.Sell, quantity, price, CreatedAt);

        // Assert
        Assert.ThrowsAny<ArgumentException>(open);
    }

    [Fact]
    public void Edit_OpenOrder_ChangesQuantityPriceAndUpdatedAt()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "VALE3", OrderSide.Sell, 10, 60m, CreatedAt);

        // Act
        order.Edit(20, 61.25m, Later);

        // Assert
        Assert.Equal(20, order.Quantity);
        Assert.Equal(61.25m, order.Price);
        Assert.Equal(Later, order.UpdatedAt);
        Assert.Equal(CreatedAt, order.CreatedAt);
    }

    [Fact]
    public void Edit_CancelledOrder_Throws()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "VALE3", OrderSide.Sell, 10, 60m, CreatedAt);
        order.Cancel(Later);

        // Act
        var edit = () => order.Edit(20, 61m, Later);

        // Assert
        Assert.Throws<InvalidOperationException>(edit);
    }

    [Fact]
    public void Cancel_OpenOrder_IsCancelledAndCanNoLongerBeEditedOrCancelled()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "VALE3", OrderSide.Sell, 10, 60m, CreatedAt);

        // Act
        order.Cancel(Later);

        // Assert
        Assert.Equal(OrderStatus.Cancelled, order.Status);
        Assert.False(order.CanEdit);
        Assert.False(order.CanCancel);
        Assert.Equal(Later, order.UpdatedAt);
    }

    [Fact]
    public void Cancel_CancelledOrder_Throws()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "VALE3", OrderSide.Sell, 10, 60m, CreatedAt);
        order.Cancel(Later);

        // Act
        var cancelAgain = () => order.Cancel(Later);

        // Assert
        Assert.Throws<InvalidOperationException>(cancelAgain);
    }
}
