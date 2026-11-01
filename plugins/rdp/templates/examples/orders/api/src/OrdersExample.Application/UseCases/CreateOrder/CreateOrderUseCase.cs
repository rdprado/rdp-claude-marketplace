// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Application.Errors;
using OrdersExample.Application.Repositories;
using OrdersExample.Entities;
using OrdersExample.Infrastructure.Ids;

namespace OrdersExample.Application.UseCases.CreateOrder;

// One feature = one folder: input, output, interface and use case in this file; the validator in its own file.
// Outside use cases, one class per file.

// ---------- Input ----------
// Side and ClientOrderId arrive as the wire text; the validator checks them, so a bad value is a 400 with a field code.
public sealed record CreateOrderInput(string ClientOrderId, string Symbol, string Side, int Quantity, decimal Price);

// ---------- Output ----------
// IsReplay: the order was already placed by an earlier send with the same client order id.
public sealed record CreateOrderOutput(
    bool IsSuccess, string ErrorCode, OutputStatus Status, OrderView? Order, IReadOnlyDictionary<string, string>? Fields,
    bool IsReplay)
{
    public static CreateOrderOutput Success(Order order)
        => new(true, string.Empty, OutputStatus.Success, OrderView.From(order), null, false);
    public static CreateOrderOutput Replay(Order order)
        => new(true, string.Empty, OutputStatus.Success, OrderView.From(order), null, true);
    public static CreateOrderOutput Validation(string errorCode, IReadOnlyDictionary<string, string>? fields)
        => new(false, errorCode, OutputStatus.Validation, null, fields, false);
    public static CreateOrderOutput Conflict(string errorCode)
        => new(false, errorCode, OutputStatus.Conflict, null, null, false);
}

// ---------- Interface ----------
public interface ICreateOrderUseCase
{
    Task<CreateOrderOutput> ExecuteAsync(CreateOrderInput input);
}

// ---------- UseCase ----------
public sealed class CreateOrderUseCase(IOrderRepository orders, IIdGenerator ids, TimeProvider time) : ICreateOrderUseCase
{
    public async Task<CreateOrderOutput> ExecuteAsync(CreateOrderInput input)
    {
        var validation = CreateOrderValidator.Validate(input);
        if (!validation.IsValid)
            return CreateOrderOutput.Validation(validation.ErrorCode, validation.Fields);

        // The validator accepted them, so they parse here.
        var side = CreateOrderValidator.ParseSide(input.Side)
            ?? throw new InvalidOperationException("A validated side did not parse.");
        var clientOrderId = CreateOrderValidator.ParseClientOrderId(input.ClientOrderId)
            ?? throw new InvalidOperationException("A validated client order id did not parse.");

        // Idempotent: a resend (the client never got the first answer) returns the order already placed.
        var placed = await orders.FindByClientOrderIdAsync(clientOrderId);
        if (placed is null)
        {
            var order = Order.Open(
                ids.NewId(), clientOrderId, input.Symbol, side, input.Quantity, input.Price, time.GetUtcNow().UtcDateTime);
            if (await orders.AddAsync(order))
                return CreateOrderOutput.Success(order);
            placed = await orders.FindByClientOrderIdAsync(clientOrderId)
                ?? throw new InvalidOperationException("The client order id was taken, but no order has it.");
        }

        return placed.IsSameRequest(input.Symbol, side, input.Quantity, input.Price)
            ? CreateOrderOutput.Replay(placed)
            : CreateOrderOutput.Conflict(ErrorCodes.ClientOrderIdReused);
    }
}
