// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Infrastructure.Ids;

public sealed class GuidIdGenerator : IIdGenerator
{
    public Guid NewId() => Guid.NewGuid();
}
