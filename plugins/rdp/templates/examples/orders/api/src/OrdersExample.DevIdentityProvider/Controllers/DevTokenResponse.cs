// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Text.Json.Serialization;

namespace OrdersExample.DevIdentityProvider.Controllers;

// RFC 6749 §5.1 names, snake_case on the wire.
public sealed record DevTokenResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("refresh_token")] string RefreshToken,
    [property: JsonPropertyName("expires_in")] int ExpiresIn,
    [property: JsonPropertyName("token_type")] string TokenType);
