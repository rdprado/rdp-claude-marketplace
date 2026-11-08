// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using OrdersExample.Tests.Integration.Infrastructure;

namespace OrdersExample.Tests.Integration.Broad;

// Broad integration test: what the API answers without a token or with a rejected one, and that the dev
// identity provider is not there outside Development.
public class AuthenticationTests(TestWebApplicationFactory factory) : IClassFixture<TestWebApplicationFactory>
{
    private const string UnauthorizedBody = """{"error":{"code":"unauthorized"}}""";

    [Fact]
    public async Task List_WithoutToken_Returns401Unauthorized()
    {
        // Arrange
        var client = factory.CreateClient();

        // Act
        var response = await client.GetAsync("/api/v1/orders");

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(UnauthorizedBody, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Create_WithoutToken_Returns401AndCreatesNothing()
    {
        // Arrange
        await factory.ResetDatabaseAsync();
        var client = factory.CreateClient();

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/orders", new { symbol = "PETR4", side = "buy", quantity = 1, price = 1 });

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(UnauthorizedBody, await response.Content.ReadAsStringAsync());
        var list = await factory.CreateAuthenticatedClient().GetStringAsync("/api/v1/orders");
        Assert.Equal("[]", list);
    }

    public static TheoryData<string> RejectedTokens => new()
    {
        // Expired long ago (exp in 2020).
        TestWebApplicationFactory.MintToken(expires: new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
        // Signed with another key.
        TestWebApplicationFactory.MintToken(
            signingKey: new SymmetricSecurityKey(Encoding.UTF8.GetBytes("another-key-that-the-api-does-not-trust"))),
        // Issued for another API.
        TestWebApplicationFactory.MintToken(audience: "another-api"),
        "not-a-jwt",
    };

    [Theory]
    [MemberData(nameof(RejectedTokens))]
    public async Task List_WithRejectedToken_Returns401Unauthorized(string token)
    {
        // Arrange
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Act
        var response = await client.GetAsync("/api/v1/orders");

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(UnauthorizedBody, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task DevIdentityProvider_OutsideDevelopment_IsNotThere()
    {
        // Arrange
        var client = factory.CreateClient(new() { AllowAutoRedirect = false });

        // Act
        var response = await client.GetAsync("/dev-idp/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback");

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
