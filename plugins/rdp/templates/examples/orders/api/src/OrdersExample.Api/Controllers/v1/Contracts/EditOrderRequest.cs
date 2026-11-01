// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.UseCases.EditOrder;

namespace OrdersExample.Api.Controllers.v1.Contracts;

public sealed record EditOrderRequest(int? Quantity, decimal? Price)
{
    public EditOrderInput ToInput(Guid orderId) => new(orderId, Quantity ?? 0, Price ?? 0);
}
