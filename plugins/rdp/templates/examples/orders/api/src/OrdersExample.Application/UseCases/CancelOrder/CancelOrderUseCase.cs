// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.Errors;
using OrdersExample.Application.Repositories;
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases.CancelOrder;

// ---------- Input ----------
public sealed record CancelOrderInput(Guid OrderId);

// ---------- Output ----------
public sealed record CancelOrderOutput(bool IsSuccess, string ErrorCode, OutputStatus Status, OrderView? Order)
{
    public static CancelOrderOutput Success(Order order)
        => new(true, string.Empty, OutputStatus.Success, OrderView.From(order));
    public static CancelOrderOutput NotFound()
        => new(false, ErrorCodes.OrderNotFound, OutputStatus.NotFound, null);
    public static CancelOrderOutput NotOpen()
        => new(false, ErrorCodes.OrderNotOpen, OutputStatus.Conflict, null);
}

// ---------- Interface ----------
public interface ICancelOrderUseCase
{
    Task<CancelOrderOutput> ExecuteAsync(CancelOrderInput input);
}

// ---------- UseCase ----------
public sealed class CancelOrderUseCase(IOrderRepository orders, TimeProvider time) : ICancelOrderUseCase
{
    public async Task<CancelOrderOutput> ExecuteAsync(CancelOrderInput input)
    {
        var order = await orders.FindAsync(input.OrderId);
        if (order is null)
            return CancelOrderOutput.NotFound();
        if (!order.CanCancel)
            return CancelOrderOutput.NotOpen();

        order.Cancel(time.GetUtcNow().UtcDateTime);
        await orders.UpdateAsync(order);
        return CancelOrderOutput.Success(order);
    }
}
