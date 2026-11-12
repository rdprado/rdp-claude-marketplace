// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace OrdersExample.DevIdentityProvider.Controllers;

/// <summary>
/// A fake OAuth 2.0 identity provider for Development: authorization code + PKCE (S256), rotating refresh
/// tokens, revoke. It answers on kr-identity's paths and parameters (<c>authorize</c>, <c>oauth/token</c>,
/// <c>oauth/revoke</c> under the issuer), so a BFF written for kr-identity works against it unchanged.
/// It approves every sign-in as the dev user. Errors use the OAuth shape
/// (<c>{ "error": "invalid_grant" }</c>, RFC 6749 §5.2) because it stands in for a real provider.
/// </summary>
[ApiController]
[Route("dev-idp")]
public sealed class DevIdentityProviderController(
    DevAuthorizationCodes codes,
    DevRefreshTokens refreshTokens,
    DevAccessTokenIssuer accessTokens,
    IOptions<DevIdentityProviderOptions> options) : ControllerBase
{
    private const string InvalidRequest = "invalid_request";

    // client_id, client_secret and scope are accepted as kr-identity takes them, and ignored: the fake trusts any client.
    [HttpGet("authorize")]
    public IActionResult Authorize(
        [FromQuery(Name = "redirect_uri")] string? redirectUri,
        [FromQuery(Name = "state")] string? state,
        [FromQuery(Name = "code_challenge")] string? codeChallenge,
        [FromQuery(Name = "code_challenge_method")] string? codeChallengeMethod,
        [FromQuery(Name = "client_id")] string? clientId = null,
        [FromQuery(Name = "scope")] string? scope = null)
    {
        // Never redirect to an address that isn't registered: that would hand the code to anyone.
        if (redirectUri is null || !options.Value.RedirectUris.Contains(redirectUri, StringComparer.Ordinal))
            return OAuthError(InvalidRequest);
        if (string.IsNullOrEmpty(codeChallenge) || codeChallengeMethod != "S256")
            return Redirect(WithQuery(redirectUri, ("error", InvalidRequest), ("state", state)));

        var code = codes.Issue(redirectUri, codeChallenge);
        return Redirect(WithQuery(redirectUri, ("code", code), ("state", state)));
    }

    [HttpPost("oauth/token")]
    [Consumes("application/x-www-form-urlencoded")]
    public IActionResult Token(
        [FromForm(Name = "grant_type")] string? grantType,
        [FromForm(Name = "code")] string? code,
        [FromForm(Name = "redirect_uri")] string? redirectUri,
        [FromForm(Name = "code_verifier")] string? codeVerifier,
        [FromForm(Name = "refresh_token")] string? refreshToken,
        [FromForm(Name = "client_id")] string? clientId = null,
        [FromForm(Name = "client_secret")] string? clientSecret = null,
        [FromForm(Name = "scope")] string? scope = null)
    {
        Response.Headers.CacheControl = "no-store";
        return grantType switch
        {
            "authorization_code" => RedeemCode(code, redirectUri, codeVerifier),
            "refresh_token" => Refresh(refreshToken),
            _ => OAuthError("unsupported_grant_type"),
        };
    }

    [HttpPost("oauth/revoke")]
    [Consumes("application/x-www-form-urlencoded")]
    public IActionResult Revoke(
        [FromForm(Name = "token")] string? token,
        [FromForm(Name = "client_id")] string? clientId = null,
        [FromForm(Name = "client_secret")] string? clientSecret = null,
        [FromForm(Name = "scope")] string? scope = null)
    {
        if (string.IsNullOrEmpty(token))
            return OAuthError(InvalidRequest);

        // RFC 7009: 200 even for an unknown token, so the answer tells nothing about which tokens exist.
        refreshTokens.Revoke(token);
        return Ok();
    }

    private IActionResult RedeemCode(string? code, string? redirectUri, string? codeVerifier)
    {
        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(redirectUri) || string.IsNullOrEmpty(codeVerifier))
            return OAuthError(InvalidRequest);
        if (!codes.TryRedeem(code, redirectUri, codeVerifier))
            return OAuthError("invalid_grant");

        // A new sign-in starts a new refresh token family.
        return Ok(Tokens(refreshTokens.Issue(Guid.NewGuid())));
    }

    private IActionResult Refresh(string? refreshToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
            return OAuthError(InvalidRequest);

        var rotation = refreshTokens.Rotate(refreshToken);
        if (rotation.Outcome != RefreshOutcome.Rotated || rotation.NewToken is null)
            return OAuthError("invalid_grant");
        return Ok(Tokens(rotation.NewToken));
    }

    private DevTokenResponse Tokens(string refreshToken)
        => new(accessTokens.Issue(), refreshToken, (int)DevAccessTokenIssuer.Lifetime.TotalSeconds, "Bearer");

    private BadRequestObjectResult OAuthError(string error) => BadRequest(new DevOAuthError(error));

    private static string WithQuery(string uri, params (string Name, string? Value)[] parameters)
        => QueryHelpers.AddQueryString(
            uri, parameters.Where(p => p.Value is not null).Select(p => KeyValuePair.Create(p.Name, p.Value)));
}
