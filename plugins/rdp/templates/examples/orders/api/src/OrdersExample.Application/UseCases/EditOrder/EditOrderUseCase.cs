// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.Errors;
using OrdersExample.Application.Repositories;
using OrdersExample.Entities;

namespace OrdersExample.Application.UseCases.EditOrder;

// ---------- Input ----------
public sealed record EditOrderInput(Guid OrderId, int Quantity, decimal Price);

// ---------- Output ----------
public sealed record EditOrderOutput(
    bool IsSuccess, string ErrorCode, OutputStatus Status, OrderView? Order, IReadOnlyDictionary<string, string>? Fields)
{
    public static EditOrderOutput Success(Order order)
        => new(true, string.Empty, OutputStatus.Success, OrderView.From(order), null);
    public static EditOrderOutput Validation(string errorCode, IReadOnlyDictionary<string, string>? fields)
        => new(false, errorCode, OutputStatus.Validation, null, fields);
    public static EditOrderOutput NotFound()
        => new(false, ErrorCodes.OrderNotFound, OutputStatus.NotFound, null, null);
    public static EditOrderOutput NotOpen()
        => new(false, ErrorCodes.OrderNotOpen, OutputStatus.Conflict, null, null);
}

// ---------- Interface ----------
public interface IEditOrderUseCase
{
    Task<EditOrderOutput> ExecuteAsync(EditOrderInput input);
}

// ---------- UseCase ----------
public sealed class EditOrderUseCase(IOrderRepository orders, TimeProvider time) : IEditOrderUseCase
{
    public async Task<EditOrderOutput> ExecuteAsync(EditOrderInput input)
    {
        var validation = EditOrderValidator.Validate(input);
        if (!validation.IsValid)
            return EditOrderOutput.Validation(validation.ErrorCode, validation.Fields);

        var order = await orders.FindAsync(input.OrderId);
        if (order is null)
            return EditOrderOutput.NotFound();
        if (!order.CanEdit)
            return EditOrderOutput.NotOpen();

        order.Edit(input.Quantity, input.Price, time.GetUtcNow().UtcDateTime);
        await orders.UpdateAsync(order);
        return EditOrderOutput.Success(order);
    }
}
