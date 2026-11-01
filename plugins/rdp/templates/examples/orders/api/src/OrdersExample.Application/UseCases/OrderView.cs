// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases;

// What the order use cases return: plain data, never the entity.
public sealed record OrderView(
    Guid Id,
    Guid ClientOrderId,
    string Symbol,
    OrderSide Side,
    int Quantity,
    decimal Price,
    DateTime CreatedAt)
{
    public static OrderView From(Order order) => new(
        order.Id, order.ClientOrderId, order.Symbol, order.Side, order.Quantity, order.Price, order.CreatedAt);
}
