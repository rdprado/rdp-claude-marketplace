// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.EntityFrameworkCore;
using OrdersExample.Entities;

namespace OrdersExample.Infrastructure.OrdersRepository;

public sealed class OrdersDbContext(DbContextOptions<OrdersDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
        => modelBuilder.ApplyConfigurationsFromAssembly(typeof(OrdersDbContext).Assembly);
}
