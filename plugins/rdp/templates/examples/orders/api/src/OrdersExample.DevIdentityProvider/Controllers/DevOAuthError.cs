// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Text.Json.Serialization;

namespace OrdersExample.DevIdentityProvider.Controllers;

// RFC 6749 §5.2: { "error": "invalid_grant" }.
public sealed record DevOAuthError([property: JsonPropertyName("error")] string Error);
