// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace OrdersExample.DevIdentityProvider;

/// <summary>
/// One-time sign-in codes: valid 60 s, redeemable once, only with the same redirect_uri
/// and a code_verifier that matches the PKCE (S256) challenge given at /authorize.
/// </summary>
public sealed class DevAuthorizationCodes(TimeProvider time)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(60);

    private readonly ConcurrentDictionary<string, PendingCode> _pending = new();

    public string Issue(string redirectUri, string codeChallenge)
    {
        var code = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        _pending[code] = new PendingCode(redirectUri, codeChallenge, time.GetUtcNow() + Lifetime);
        return code;
    }

    public bool TryRedeem(string code, string redirectUri, string codeVerifier)
    {
        // Removed on the first attempt, right or wrong: a code is never tried twice.
        if (!_pending.TryRemove(code, out var pending))
            return false;
        if (time.GetUtcNow() >= pending.ExpiresAt)
            return false;
        if (!string.Equals(pending.RedirectUri, redirectUri, StringComparison.Ordinal))
            return false;
        return MatchesChallenge(codeVerifier, pending.CodeChallenge);
    }

    // RFC 7636 S256: BASE64URL(SHA256(ASCII(code_verifier))) == code_challenge.
    private static bool MatchesChallenge(string codeVerifier, string codeChallenge)
    {
        var computed = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier)));
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(computed), Encoding.ASCII.GetBytes(codeChallenge));
    }

    private sealed record PendingCode(string RedirectUri, string CodeChallenge, DateTimeOffset ExpiresAt);
}
