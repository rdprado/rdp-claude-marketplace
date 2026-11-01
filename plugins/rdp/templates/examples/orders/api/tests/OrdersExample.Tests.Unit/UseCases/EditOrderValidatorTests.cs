// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.UseCases.EditOrder;

namespace OrdersExample.Tests.Unit.UseCases;

public class EditOrderValidatorTests
{
    [Fact]
    public void Validate_WithSmallestPositiveValues_Succeeds()
    {
        // Arrange
        var input = new EditOrderInput(Guid.NewGuid(), 1, 0.01m);

        // Act
        var result = EditOrderValidator.Validate(input);

        // Assert
        Assert.True(result.IsValid);
        Assert.Null(result.Fields);
    }

    [Fact]
    public void Validate_WithZeroQuantityAndNegativePrice_NamesBothFields()
    {
        // Arrange
        var input = new EditOrderInput(Guid.NewGuid(), 0, -5m);

        // Act
        var result = EditOrderValidator.Validate(input);

        // Assert
        Assert.False(result.IsValid);
        Assert.Equal("validation-failed", result.ErrorCode);
        var expected = new Dictionary<string, string>
        {
            ["quantity"] = "must-be-positive",
            ["price"] = "must-be-positive",
        };
        Assert.Equal(expected, result.Fields);
    }
}
