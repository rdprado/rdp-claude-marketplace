// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Extensions.DependencyInjection;
using OrdersExample.Application.UseCases.CancelOrder;
using OrdersExample.Application.UseCases.CreateOrder;
using OrdersExample.Application.UseCases.EditOrder;
using OrdersExample.Application.UseCases.GetOrder;
using OrdersExample.Application.UseCases.ListOrders;

namespace OrdersExample.Application;

// One AddXxx() per project, named after it; each Infrastructure project adds its own (no single AddInfrastructure).
// No MediatR, AutoMapper or FluentValidation: use cases are called directly, mapping is one line, validators are static classes.
public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
        => services
            .AddScoped<IListOrdersUseCase, ListOrdersUseCase>()
            .AddScoped<IGetOrderUseCase, GetOrderUseCase>()
            .AddScoped<ICreateOrderUseCase, CreateOrderUseCase>()
            .AddScoped<IEditOrderUseCase, EditOrderUseCase>()
            .AddScoped<ICancelOrderUseCase, CancelOrderUseCase>();
}
