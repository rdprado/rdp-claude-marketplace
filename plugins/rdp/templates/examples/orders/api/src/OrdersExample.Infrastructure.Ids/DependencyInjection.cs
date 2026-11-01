// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Extensions.DependencyInjection;

namespace OrdersExample.Infrastructure.Ids;

public static class DependencyInjection
{
    public static IServiceCollection AddIds(this IServiceCollection services)
        => services.AddSingleton<IIdGenerator, GuidIdGenerator>();
}
