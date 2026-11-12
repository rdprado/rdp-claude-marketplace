// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using OrdersExample.DevIdentityProvider;
using OrdersExample.DevIdentityProvider.Controllers;

namespace OrdersExample.Tests.Unit.DevIdentityProvider;

// The fake identity provider with its real in-memory stores; only the clock is fake.
public sealed class DevIdentityProviderControllerTests : IDisposable
{
    private const string RedirectUri = "http://localhost:5173/auth/callback";
    private const string Issuer = "http://localhost:5180/dev-idp";
    private const string Audience = "orders-example-api";
    // RFC 7636 appendix B: this verifier's S256 challenge is exactly this value.
    private const string Verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    private const string Challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 1, 15, 12, 0, 0, TimeSpan.Zero));
    private readonly DevSigningKey _signingKey = new();
    private readonly DevIdentityProviderController _controller;

    public DevIdentityProviderControllerTests()
    {
        var options = Options.Create(new DevIdentityProviderOptions
        {
            Issuer = Issuer,
            Audience = Audience,
            RedirectUris = [RedirectUri],
        });
        _controller = new DevIdentityProviderController(
            new DevAuthorizationCodes(_time),
            new DevRefreshTokens(),
            new DevAccessTokenIssuer(_signingKey, options, _time),
            options)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    public void Dispose() => _signingKey.Dispose();

    [Fact]
    public void Authorize_WithUnregisteredRedirectUri_Returns400AndDoesNotRedirect()
    {
        // Arrange
        const string evil = "https://evil.example/callback";

        // Act
        var result = _controller.Authorize(evil, "s1", Challenge, "S256");

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(new DevOAuthError("invalid_request"), badRequest.Value);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData(Challenge, "plain")]
    public void Authorize_WithoutS256Challenge_RedirectsWithInvalidRequest(string? challenge, string? method)
    {
        // Act
        var result = _controller.Authorize(RedirectUri, "s1", challenge, method);

        // Assert
        var query = QueryOf(Assert.IsType<RedirectResult>(result).Url);
        Assert.Equal("invalid_request", query["error"]);
        Assert.Equal("s1", query["state"]);
        Assert.False(query.ContainsKey("code"));
    }

    [Fact]
    public void Authorize_WithValidRequest_RedirectsWithCodeAndState()
    {
        // Act
        var result = _controller.Authorize(RedirectUri, "state-123", Challenge, "S256");

        // Assert
        var url = Assert.IsType<RedirectResult>(result).Url;
        Assert.StartsWith(RedirectUri + "?", url);
        var query = QueryOf(url);
        Assert.Equal("state-123", query["state"]);
        Assert.False(string.IsNullOrEmpty(query["code"]));
    }

    [Fact]
    public async Task Token_WithValidCodeAndVerifier_ReturnsSignedFiveMinuteTokenForDevUser()
    {
        // Arrange
        var code = SignIn();

        // Act
        var result = _controller.Token("authorization_code", code, RedirectUri, Verifier, null);

        // Assert
        var tokens = Assert.IsType<DevTokenResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal(300, tokens.ExpiresIn);
        Assert.Equal("Bearer", tokens.TokenType);
        Assert.False(string.IsNullOrEmpty(tokens.RefreshToken));
        Assert.Equal("no-store", _controller.Response.Headers.CacheControl.ToString());
        // The fake clock is in the past, so lifetime is checked from the claims, not against now.
        var validation = await new JsonWebTokenHandler().ValidateTokenAsync(tokens.AccessToken, new TokenValidationParameters
        {
            ValidIssuer = Issuer,
            ValidAudience = Audience,
            IssuerSigningKey = _signingKey.SecurityKey,
            ValidateLifetime = false,
        });
        Assert.True(validation.IsValid);
        var jwt = (JsonWebToken)validation.SecurityToken;
        Assert.Equal("6f1c2b8e-3d4a-4e5f-9a7b-1c2d3e4f5a6b", jwt.Subject);
        Assert.Equal(new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), jwt.IssuedAt);
        Assert.Equal(new DateTime(2026, 1, 15, 12, 5, 0, DateTimeKind.Utc), jwt.ValidTo);
        Assert.False(jwt.TryGetPayloadValue<string>("email", out _));
    }

    [Fact]
    public void Token_WithKrIdentityClientFields_StillRedeemsValidCode()
    {
        // Arrange
        var code = SignIn();

        // Act
        var result = _controller.Token(
            "authorization_code", code, RedirectUri, Verifier, null, "orders-web", "any-secret", "openid offline_access");

        // Assert
        var tokens = Assert.IsType<DevTokenResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.False(string.IsNullOrEmpty(tokens.RefreshToken));
    }

    [Fact]
    public void Token_WithCodeUsedTwice_RefusesTheSecondTime()
    {
        // Arrange
        var code = SignIn();
        _controller.Token("authorization_code", code, RedirectUri, Verifier, null);

        // Act
        var second = _controller.Token("authorization_code", code, RedirectUri, Verifier, null);

        // Assert
        AssertOAuthError("invalid_grant", second);
    }

    [Fact]
    public void Token_WithWrongVerifier_RefusesAndBurnsTheCode()
    {
        // Arrange
        var code = SignIn();
        var wrong = _controller.Token("authorization_code", code, RedirectUri, "wrong-verifier", null);

        // Act
        var retryWithRightVerifier = _controller.Token("authorization_code", code, RedirectUri, Verifier, null);

        // Assert
        AssertOAuthError("invalid_grant", wrong);
        AssertOAuthError("invalid_grant", retryWithRightVerifier);
    }

    [Fact]
    public void Token_WithAnotherRedirectUri_Refuses()
    {
        // Arrange
        var code = SignIn();

        // Act
        var result = _controller.Token("authorization_code", code, "http://localhost:5173/other", Verifier, null);

        // Assert
        AssertOAuthError("invalid_grant", result);
    }

    [Theory]
    [InlineData(59, true)]
    [InlineData(60, false)] // 60 s: the limit, already expired
    public void Token_CodeAge_ValidOnlyUnderSixtySeconds(int ageSeconds, bool accepted)
    {
        // Arrange
        var code = SignIn();
        _time.Advance(TimeSpan.FromSeconds(ageSeconds));

        // Act
        var result = _controller.Token("authorization_code", code, RedirectUri, Verifier, null);

        // Assert
        Assert.Equal(accepted, result is OkObjectResult);
    }

    [Fact]
    public void Token_RefreshWithCurrentToken_ReturnsNewRefreshToken()
    {
        // Arrange
        var first = RedeemTokens();

        // Act
        var result = _controller.Token("refresh_token", null, null, null, first.RefreshToken);

        // Assert
        var rotated = Assert.IsType<DevTokenResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.NotEqual(first.RefreshToken, rotated.RefreshToken);
    }

    [Fact]
    public void Token_RefreshWithRotatedToken_RefusesAndRevokesTheWholeSignIn()
    {
        // Arrange
        var first = RedeemTokens();
        var rotated = Refresh(first.RefreshToken);

        // Act
        var reuse = _controller.Token("refresh_token", null, null, null, first.RefreshToken);

        // Assert
        AssertOAuthError("invalid_grant", reuse);
        // The newest token of that sign-in stopped working too: the thief and the user are both out.
        AssertOAuthError("invalid_grant", _controller.Token("refresh_token", null, null, null, rotated.RefreshToken));
    }

    [Fact]
    public void Revoke_ThenRefresh_Refuses()
    {
        // Arrange
        var tokens = RedeemTokens();
        _controller.Revoke(tokens.RefreshToken);

        // Act
        var result = _controller.Token("refresh_token", null, null, null, tokens.RefreshToken);

        // Assert
        AssertOAuthError("invalid_grant", result);
    }

    [Fact]
    public void Revoke_UnknownToken_StillReturns200()
    {
        // Act
        var result = _controller.Revoke("never-issued");

        // Assert
        Assert.IsType<OkResult>(result);
    }

    [Fact]
    public void Token_WithUnknownGrantType_ReturnsUnsupportedGrantType()
    {
        // Act
        var result = _controller.Token("password", null, null, null, null);

        // Assert
        AssertOAuthError("unsupported_grant_type", result);
    }

    [Fact]
    public void PkceTestVector_MatchesRfc7636()
    {
        // Arrange: guards the constants above, computed here independently of the code under test.
        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(Verifier));

        // Act
        var challenge = Convert.ToBase64String(hash).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        // Assert
        Assert.Equal(Challenge, challenge);
    }

    private string SignIn()
    {
        var url = ((RedirectResult)_controller.Authorize(RedirectUri, "s", Challenge, "S256")).Url;
        return QueryOf(url)["code"].ToString();
    }

    private DevTokenResponse RedeemTokens()
        => (DevTokenResponse)((OkObjectResult)_controller.Token(
            "authorization_code", SignIn(), RedirectUri, Verifier, null)).Value!;

    private DevTokenResponse Refresh(string refreshToken)
        => (DevTokenResponse)((OkObjectResult)_controller.Token(
            "refresh_token", null, null, null, refreshToken)).Value!;

    private static Dictionary<string, Microsoft.Extensions.Primitives.StringValues> QueryOf(string url)
        => QueryHelpers.ParseQuery(new Uri(url).Query);

    private static void AssertOAuthError(string expected, IActionResult result)
        => Assert.Equal(new DevOAuthError(expected), Assert.IsType<BadRequestObjectResult>(result).Value);
}
