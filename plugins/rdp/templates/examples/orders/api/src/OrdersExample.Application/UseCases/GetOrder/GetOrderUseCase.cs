// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.Errors;
using OrdersExample.Application.Repositories;
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases.GetOrder;

// ---------- Input ----------
public sealed record GetOrderInput(Guid OrderId);

// ---------- Output ----------
public sealed record GetOrderOutput(bool IsSuccess, string ErrorCode, OutputStatus Status, OrderView? Order)
{
    public static GetOrderOutput Success(Order order) => new(true, string.Empty, OutputStatus.Success, OrderView.From(order));
    public static GetOrderOutput NotFound() => new(false, ErrorCodes.OrderNotFound, OutputStatus.NotFound, null);
}

// ---------- Interface ----------
public interface IGetOrderUseCase
{
    Task<GetOrderOutput> ExecuteAsync(GetOrderInput input);
}

// ---------- UseCase ----------
public sealed class GetOrderUseCase(IOrderRepository orders) : IGetOrderUseCase
{
    public async Task<GetOrderOutput> ExecuteAsync(GetOrderInput input)
    {
        var order = await orders.FindAsync(input.OrderId);
        return order is null ? GetOrderOutput.NotFound() : GetOrderOutput.Success(order);
    }
}
