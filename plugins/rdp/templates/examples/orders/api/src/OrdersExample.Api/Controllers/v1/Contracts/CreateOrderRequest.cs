// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.UseCases.CreateOrder;

namespace OrdersExample.Api.Controllers.v1.Contracts;

// Requests and responses are sealed records next to the controller: init or positional, never set.
// Fields are nullable so a missing one reaches the validator (a field code), not the model binder.
public sealed record CreateOrderRequest(string? ClientOrderId, string? Symbol, string? Side, int? Quantity, decimal? Price)
{
    public CreateOrderInput ToInput()
        => new(ClientOrderId ?? string.Empty, Symbol ?? string.Empty, Side ?? string.Empty, Quantity ?? 0, Price ?? 0);
}
