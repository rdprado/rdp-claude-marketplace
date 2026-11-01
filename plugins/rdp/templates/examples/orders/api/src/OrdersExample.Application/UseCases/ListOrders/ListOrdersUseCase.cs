// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.Repositories;
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases.ListOrders;

// No Input: listing takes no parameters yet. Add one when it gets filters or paging.

// ---------- Output ----------
public sealed record ListOrdersOutput(
    bool IsSuccess, string ErrorCode, OutputStatus Status, IReadOnlyList<OrderView> Orders)
{
    public static ListOrdersOutput Success(IReadOnlyList<Order> orders)
        => new(true, string.Empty, OutputStatus.Success, orders.Select(OrderView.From).ToList());
}

// ---------- Interface ----------
public interface IListOrdersUseCase
{
    Task<ListOrdersOutput> ExecuteAsync();
}

// ---------- UseCase ----------
public sealed class ListOrdersUseCase(IOrderRepository orders) : IListOrdersUseCase
{
    public async Task<ListOrdersOutput> ExecuteAsync()
        => ListOrdersOutput.Success(await orders.ListAsync());
}
