// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Application.UseCases;

// Add a member only for a new HTTP mapping (e.g. Forbidden = 4), never one per feature.
public enum OutputStatus
{
    Success = 0,
    Validation = 2,
    Conflict = 3,
}
