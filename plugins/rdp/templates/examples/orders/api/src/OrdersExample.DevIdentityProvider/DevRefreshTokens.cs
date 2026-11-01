// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;

namespace OrdersExample.DevIdentityProvider;

/// <summary>
/// Opaque refresh tokens that rotate on every use. All tokens of one sign-in form a family:
/// reusing a rotated token, or revoking any token, ends the whole family.
/// </summary>
public sealed class DevRefreshTokens
{
    private readonly Lock _gate = new();
    private readonly Dictionary<string, IssuedToken> _tokens = [];
    private readonly HashSet<Guid> _revokedSignIns = [];

    public string Issue(Guid signInId)
    {
        lock (_gate)
            return IssueLocked(signInId);
    }

    public RefreshRotation Rotate(string token)
    {
        lock (_gate)
        {
            if (!_tokens.TryGetValue(token, out var issued) || _revokedSignIns.Contains(issued.SignInId))
                return new RefreshRotation(RefreshOutcome.Invalid, null);
            if (issued.Rotated)
            {
                _revokedSignIns.Add(issued.SignInId);
                return new RefreshRotation(RefreshOutcome.Reused, null);
            }

            _tokens[token] = issued with { Rotated = true };
            return new RefreshRotation(RefreshOutcome.Rotated, IssueLocked(issued.SignInId));
        }
    }

    public void Revoke(string token)
    {
        lock (_gate)
        {
            if (_tokens.TryGetValue(token, out var issued))
                _revokedSignIns.Add(issued.SignInId);
        }
    }

    private string IssueLocked(Guid signInId)
    {
        var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        _tokens[token] = new IssuedToken(signInId, Rotated: false);
        return token;
    }

    private sealed record IssuedToken(Guid SignInId, bool Rotated);
}
