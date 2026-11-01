// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.UseCases;
using OrdersExample.Entities;

namespace OrdersExample.Api.Controllers.v1.Contracts;

// Enums go out camelCase ("buy", "sell").
public sealed record OrderResponse(
    Guid Id,
    Guid ClientOrderId,
    string Symbol,
    OrderSide Side,
    int Quantity,
    decimal Price,
    DateTime CreatedAt)
{
    public static OrderResponse From(OrderView order) => new(
        order.Id, order.ClientOrderId, order.Symbol, order.Side, order.Quantity, order.Price, order.CreatedAt);
}
