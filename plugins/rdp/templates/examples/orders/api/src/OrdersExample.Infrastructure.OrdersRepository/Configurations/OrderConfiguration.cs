// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OrdersExample.Entities;

namespace OrdersExample.Infrastructure.OrdersRepository.Configurations;

public sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("Orders");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Symbol).HasMaxLength(OrderRules.SymbolMaxLength).IsRequired();
        builder.Property(o => o.Side).HasConversion<string>().HasMaxLength(8);
        // SQLite gives DateTime back with Kind Unspecified; the values are UTC, so say so (the JSON then ends in "Z").
        builder.Property(o => o.CreatedAt).HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        builder.HasIndex(o => o.CreatedAt);
        // The real guard for idempotency: two sends racing with the same client order id store one order.
        builder.HasIndex(o => o.ClientOrderId).IsUnique();
    }
}
