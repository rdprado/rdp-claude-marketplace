// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.DevIdentityProvider;

// Section "DevIdentityProvider" of appsettings.json (Development only).
public sealed class DevIdentityProviderOptions
{
    public const string SectionName = "DevIdentityProvider";

    // The "iss" and "aud" of the tokens it issues; the API validates both.
    public string Issuer { get; init; } = string.Empty;
    public string Audience { get; init; } = string.Empty;

    // Where /authorize may send the code back. Anything else is refused, as a real identity provider does.
    public IReadOnlyList<string> RedirectUris { get; init; } = [];
}
