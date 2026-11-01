// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;

namespace OrdersExample.DevIdentityProvider;

/// <summary>
/// The RSA key the fake identity provider signs with: generated at startup and kept only in memory,
/// so there is no secret in config. A restart makes every issued token invalid, which is fine in Development.
/// </summary>
public sealed class DevSigningKey : IDisposable
{
    private readonly RSA _rsa = CreateMaterializedKey();

    public DevSigningKey() => SecurityKey = new RsaSecurityKey(_rsa) { KeyId = "dev-idp" };

    public RsaSecurityKey SecurityKey { get; }

    public void Dispose() => _rsa.Dispose();

    // On Windows a bare RSA.Create(2048) generates its key lazily; signing and validating could then race to it.
    private static RSA CreateMaterializedKey()
    {
        using var generated = RSA.Create(2048);
        return RSA.Create(generated.ExportParameters(includePrivateParameters: true));
    }
}
