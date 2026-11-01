// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.DevIdentityProvider;

public enum RefreshOutcome
{
    Rotated = 0,
    // Unknown, revoked, or from a sign-in that was revoked.
    Invalid = 1,
    // A token that was already rotated came back: possible theft, so the whole sign-in is revoked.
    Reused = 2,
}
