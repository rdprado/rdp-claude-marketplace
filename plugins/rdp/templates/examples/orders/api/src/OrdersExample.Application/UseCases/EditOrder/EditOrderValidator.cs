// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.Errors;
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases.EditOrder;

public static class EditOrderValidator
{
    public static ValidationResult Validate(EditOrderInput input)
    {
        var fields = new Dictionary<string, string>();
        if (!OrderRules.IsValidQuantity(input.Quantity))
            fields["quantity"] = ErrorCodes.MustBePositive;
        if (!OrderRules.IsValidPrice(input.Price))
            fields["price"] = ErrorCodes.MustBePositive;

        return fields.Count == 0
            ? ValidationResult.Success
            : ValidationResult.Fail(ErrorCodes.ValidationFailed, fields);
    }
}
