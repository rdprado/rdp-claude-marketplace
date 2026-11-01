// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.UseCases.CreateOrder;

namespace OrdersExample.Tests.Unit.UseCases;

public class CreateOrderValidatorTests
{
    private const string ClientOrderId = "5f0c1b2a-3d4e-4f60-8a7b-9c0d1e2f3a4b";

    [Theory]
    [InlineData("A")]
    [InlineData("PETR4")]
    [InlineData("petr4")]
    [InlineData("ABCDEFGHIJKL")] // 12 characters: the limit
    public void Validate_WithValidSymbol_Succeeds(string symbol)
    {
        // Arrange
        var input = new CreateOrderInput(ClientOrderId, symbol, "buy", 1, 0.01m);

        // Act
        var result = CreateOrderValidator.Validate(input);

        // Assert
        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData("", "required")]
    [InlineData("   ", "required")]
    [InlineData("ABCDEFGHIJKLM", "invalid")] // 13 characters: one past the limit
    [InlineData("PETR-4", "invalid")]
    [InlineData("PÉTR4", "invalid")]
    public void Validate_WithBadSymbol_FailsWithSymbolCode(string symbol, string expectedCode)
    {
        // Arrange
        var input = new CreateOrderInput(ClientOrderId, symbol, "buy", 1, 1m);

        // Act
        var result = CreateOrderValidator.Validate(input);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("validation-failed", result.ErrorCode);
        Assert.Equal(new Dictionary<string, string> { ["symbol"] = expectedCode }, result.Fields);
    }

    [Theory]
    [InlineData("", "required")]
    [InlineData("   ", "required")]
    [InlineData("order-1", "invalid")]
    [InlineData("00000000-0000-0000-0000-000000000000", "invalid")]
    public void Validate_WithBadClientOrderId_FailsWithClientOrderIdCode(string clientOrderId, string expectedCode)
    {
        // Arrange
        var input = new CreateOrderInput(clientOrderId, "PETR4", "buy", 1, 1m);

        // Act
        var result = CreateOrderValidator.Validate(input);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal(new Dictionary<string, string> { ["clientOrderId"] = expectedCode }, result.Fields);
    }

    [Theory]
    [InlineData("")]
    [InlineData("Buy")]
    [InlineData("hold")]
    [InlineData("0")]
    public void Validate_WithBadSide_FailsWithSideInvalid(string side)
    {
        // Arrange
        var input = new CreateOrderInput(ClientOrderId, "PETR4", side, 1, 1m);

        // Act
        var result = CreateOrderValidator.Validate(input);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal(new Dictionary<string, string> { ["side"] = "invalid" }, result.Fields);
    }

    [Theory]
    [InlineData(0, "1", "quantity")]
    [InlineData(-1, "1", "quantity")]
    [InlineData(1, "0", "price")]
    [InlineData(1, "-0.01", "price")]
    public void Validate_WithNonPositiveQuantityOrPrice_FailsWithMustBePositive(
        int quantity, string price, string expectedField)
    {
        // Arrange
        var input = new CreateOrderInput(ClientOrderId, "PETR4", "sell", quantity, decimal.Parse(price, System.Globalization.CultureInfo.InvariantCulture));

        // Act
        var result = CreateOrderValidator.Validate(input);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal(new Dictionary<string, string> { [expectedField] = "must-be-positive" }, result.Fields);
    }

    [Fact]
    public void Validate_WithEveryFieldWrong_NamesEveryField()
    {
        // Arrange
        var input = new CreateOrderInput("", "", "hold", 0, 0m);

        // Act
        var result = CreateOrderValidator.Validate(input);

        // Assert
        var expected = new Dictionary<string, string>
        {
            ["clientOrderId"] = "required",
            ["symbol"] = "required",
            ["side"] = "invalid",
            ["quantity"] = "must-be-positive",
            ["price"] = "must-be-positive",
        };
        Assert.Equal(expected, result.Fields);
    }
}
