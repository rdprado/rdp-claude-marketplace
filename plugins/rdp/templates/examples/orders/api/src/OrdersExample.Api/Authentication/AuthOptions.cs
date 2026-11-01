// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Api.Authentication;

// Section "Auth": the identity provider whose tokens the API accepts (HML / PRD). Not used in Development.
public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    public string Authority { get; init; } = string.Empty;
    public string Audience { get; init; } = string.Empty;
}
