// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrdersExample.Api.Controllers.v1.Contracts;
using OrdersExample.Api.Errors;
using OrdersExample.Application.Errors;
using OrdersExample.Application.UseCases;
using OrdersExample.Application.UseCases.CancelOrder;
using OrdersExample.Application.UseCases.CreateOrder;
using OrdersExample.Application.UseCases.EditOrder;
using OrdersExample.Application.UseCases.GetOrder;
using OrdersExample.Application.UseCases.ListOrders;

namespace OrdersExample.Api.Controllers.v1;

// Controllers, not Minimal API: a test calls an action with mocked use cases. Routes are api/v1/<resource>.
// One controller per resource; each action gets only its own use case ([FromServices]).
[ApiController]
[Authorize]
[Route("api/v1/orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromServices] IListOrdersUseCase listOrders)
    {
        var output = await listOrders.ExecuteAsync();
        return Ok(output.Orders.Select(OrderResponse.From));
    }

    // The id is a string so that a non-GUID gives the contract's 404 order-not-found, not a bare routing 404.
    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id, [FromServices] IGetOrderUseCase getOrder)
    {
        if (!Guid.TryParse(id, out var orderId))
            return OrderNotFound();

        var output = await getOrder.ExecuteAsync(new GetOrderInput(orderId));
        return output.Status == OutputStatus.Success && output.Order is not null
            ? Ok(OrderResponse.From(output.Order))
            : ApiErrors.FromOutput(output.Status, output.ErrorCode);
    }

    // 201 for a new order, 200 for a resend of one already placed (same client order id and values).
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateOrderRequest request, [FromServices] ICreateOrderUseCase createOrder)
    {
        var output = await createOrder.ExecuteAsync(request.ToInput());
        if (output.Status != OutputStatus.Success || output.Order is null)
            return ApiErrors.FromOutput(output.Status, output.ErrorCode, output.Fields);

        var order = OrderResponse.From(output.Order);
        return output.IsReplay ? Ok(order) : Created($"/api/v1/orders/{order.Id}", order);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Edit(
        string id, [FromBody] EditOrderRequest request, [FromServices] IEditOrderUseCase editOrder)
    {
        if (!Guid.TryParse(id, out var orderId))
            return OrderNotFound();

        var output = await editOrder.ExecuteAsync(request.ToInput(orderId));
        return output.Status == OutputStatus.Success && output.Order is not null
            ? Ok(OrderResponse.From(output.Order))
            : ApiErrors.FromOutput(output.Status, output.ErrorCode, output.Fields);
    }

    [HttpPost("{id}/cancel")]
    public async Task<IActionResult> Cancel(string id, [FromServices] ICancelOrderUseCase cancelOrder)
    {
        if (!Guid.TryParse(id, out var orderId))
            return OrderNotFound();

        var output = await cancelOrder.ExecuteAsync(new CancelOrderInput(orderId));
        return output.Status == OutputStatus.Success && output.Order is not null
            ? Ok(OrderResponse.From(output.Order))
            : ApiErrors.FromOutput(output.Status, output.ErrorCode);
    }

    private static IActionResult OrderNotFound()
        => ApiErrors.Of(StatusCodes.Status404NotFound, ErrorCodes.OrderNotFound);
}
