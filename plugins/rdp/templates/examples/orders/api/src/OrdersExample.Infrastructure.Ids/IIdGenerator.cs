// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Infrastructure.Ids;

/// <summary>
/// New ids come from here, never from Guid.NewGuid() in the code, so a test can fix them.
/// Example: <c>var id = ids.NewId();</c>.
/// </summary>
public interface IIdGenerator
{
    Guid NewId();
}
