// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Entities;

namespace OrdersExample.Application.Repositories;

public interface IOrderRepository
{
    /// <summary>All orders, newest first.</summary>
    Task<IReadOnlyList<Order>> ListAsync();

    Task<Order?> FindAsync(Guid id);

    Task<Order?> FindByClientOrderIdAsync(Guid clientOrderId);

    /// <summary>False when another order already has its client order id (a resend that raced this one).</summary>
    Task<bool> AddAsync(Order order);

    Task UpdateAsync(Order order);
}
