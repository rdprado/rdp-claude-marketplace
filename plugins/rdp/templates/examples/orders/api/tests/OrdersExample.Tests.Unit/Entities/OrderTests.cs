// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Entities;

namespace OrdersExample.Tests.Unit.Entities;

public class OrderTests
{
    private static readonly DateTime CreatedAt = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);

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
    public void Open_WithValidValues_CreatesOrderWithUpperCaseSymbol()
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
        Assert.Equal(CreatedAt, order.CreatedAt);
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
}
