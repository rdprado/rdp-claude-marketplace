// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.Errors;
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases.CreateOrder;

public static class CreateOrderValidator
{
    public static ValidationResult Validate(CreateOrderInput input)
    {
        var fields = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(input.ClientOrderId))
            fields["clientOrderId"] = ErrorCodes.Required;
        else if (ParseClientOrderId(input.ClientOrderId) is null)
            fields["clientOrderId"] = ErrorCodes.Invalid;
        if (string.IsNullOrWhiteSpace(input.Symbol))
            fields["symbol"] = ErrorCodes.Required;
        else if (!OrderRules.IsValidSymbol(input.Symbol))
            fields["symbol"] = ErrorCodes.Invalid;
        if (ParseSide(input.Side) is null)
            fields["side"] = ErrorCodes.Invalid;
        if (!OrderRules.IsValidQuantity(input.Quantity))
            fields["quantity"] = ErrorCodes.MustBePositive;
        if (!OrderRules.IsValidPrice(input.Price))
            fields["price"] = ErrorCodes.MustBePositive;

        return fields.Count == 0
            ? ValidationResult.Success
            : ValidationResult.Fail(ErrorCodes.ValidationFailed, fields);
    }

    public static Guid? ParseClientOrderId(string clientOrderId)
        => Guid.TryParse(clientOrderId, out var id) && id != Guid.Empty ? id : null;

    // Only the contract's exact words: "Buy" or "1" are invalid.
    public static OrderSide? ParseSide(string side) => side switch
    {
        "buy" => OrderSide.Buy,
        "sell" => OrderSide.Sell,
        _ => null,
    };
}
