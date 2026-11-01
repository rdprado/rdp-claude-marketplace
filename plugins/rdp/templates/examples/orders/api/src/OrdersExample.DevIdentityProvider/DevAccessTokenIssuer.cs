// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace OrdersExample.DevIdentityProvider;

/// <summary>Signs the 5-minute access tokens (JWT, RS256) of the one dev user.</summary>
public sealed class DevAccessTokenIssuer(
    DevSigningKey signingKey, IOptions<DevIdentityProviderOptions> options, TimeProvider time)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    // Every sign-in is this user. The API only ever sees "sub", never an email.
    public const string DevUserId = "6f1c2b8e-3d4a-4e5f-9a7b-1c2d3e4f5a6b";
    public const string DevUserName = "dev-user";

    public string Issue()
    {
        var now = time.GetUtcNow().UtcDateTime;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = options.Value.Issuer,
            Audience = options.Value.Audience,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, DevUserId),
                new Claim(JwtRegisteredClaimNames.PreferredUsername, DevUserName),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            ]),
            IssuedAt = now,
            NotBefore = now,
            Expires = now.Add(Lifetime),
            SigningCredentials = new SigningCredentials(signingKey.SecurityKey, SecurityAlgorithms.RsaSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
