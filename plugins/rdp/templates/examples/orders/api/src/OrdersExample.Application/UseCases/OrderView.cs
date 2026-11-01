// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases;

// What the order use cases return: plain data, never the entity. CanEdit / CanCancel come from the entity's rules.
public sealed record OrderView(
    Guid Id,
    Guid ClientOrderId,
    string Symbol,
    OrderSide Side,
    int Quantity,
    decimal Price,
    OrderStatus Status,
    bool CanEdit,
    bool CanCancel,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static OrderView From(Order order) => new(
        order.Id, order.ClientOrderId, order.Symbol, order.Side, order.Quantity, order.Price, order.Status,
        order.CanEdit, order.CanCancel, order.CreatedAt, order.UpdatedAt);
}
