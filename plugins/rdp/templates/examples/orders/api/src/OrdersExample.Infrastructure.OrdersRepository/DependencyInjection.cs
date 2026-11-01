// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OrdersExample.Application.Repositories;

namespace OrdersExample.Infrastructure.OrdersRepository;

public static class DependencyInjection
{
    /// <summary>
    /// Orders in SQLite in-memory: the same provider as the integration tests, no database file.
    /// Not the EF InMemory provider: it is not relational (no foreign keys, unique indexes or transactions).
    /// The database lives as long as its one connection stays open, so the connection is a singleton
    /// and every DbContext uses it. Swap UseSqlite for the real provider when the project gets a database.
    /// </summary>
    public static IServiceCollection AddOrdersRepository(this IServiceCollection services)
    {
        services.AddSingleton(_ =>
        {
            var connection = new SqliteConnection("DataSource=:memory:");
            connection.Open();
            return connection;
        });
        services.AddDbContext<OrdersDbContext>((provider, options)
            => options.UseSqlite(provider.GetRequiredService<SqliteConnection>()));
        return services.AddScoped<IOrderRepository, EFOrderRepository>();
    }

    /// <summary>Creates the tables in the in-memory database. Call once, after the app is built.</summary>
    public static void CreateOrdersSchema(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        scope.ServiceProvider.GetRequiredService<OrdersDbContext>().Database.EnsureCreated();
    }
}
