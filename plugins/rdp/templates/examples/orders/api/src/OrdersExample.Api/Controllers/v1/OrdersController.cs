// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OrdersExample.Api.Controllers.v1.Contracts;
using OrdersExample.Api.Errors;
using OrdersExample.Application.UseCases;
using OrdersExample.Application.UseCases.CreateOrder;
using OrdersExample.Application.UseCases.ListOrders;

namespace OrdersExample.Api.Controllers.v1;

// Controllers, not Minimal API: a test calls an action with mocked use cases. Routes are api/v1/<resource>.
// One controller per resource; each action gets only its own use case ([FromServices]).
// The example has two use cases. A real resource adds the rest the same way, e.g. GET api/v1/orders/{id},
// PUT api/v1/orders/{id} (edit) and POST api/v1/orders/{id}/cancel (an action that isn't a field change).
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
}
