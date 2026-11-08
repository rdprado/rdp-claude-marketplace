// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Net;
using System.Text;
using OrdersExample.Tests.Integration.Infrastructure;

namespace OrdersExample.Tests.Integration.Broad;

// Broad integration test: what ASP.NET Core answers on its own still comes in the one error shape.
public class ErrorShapeTests(TestWebApplicationFactory factory) : IClassFixture<TestWebApplicationFactory>
{
    [Fact]
    public async Task Create_WithANonJsonContentType_Returns415UnsupportedMediaType()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();
        var body = new StringContent("symbol=PETR4", Encoding.UTF8, "text/plain");

        // Act
        var response = await client.PostAsync("/api/v1/orders", body);

        // Assert
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Equal("""{"error":{"code":"unsupported-media-type"}}""", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownRoute_Returns404NotFound()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();

        // Act
        var response = await client.GetAsync("/api/v1/nothing-here");

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("""{"error":{"code":"not-found"}}""", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task WrongMethod_Returns405MethodNotAllowed()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();

        // Act
        var response = await client.DeleteAsync("/api/v1/orders");

        // Assert
        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
        Assert.Equal("""{"error":{"code":"method-not-allowed"}}""", await response.Content.ReadAsStringAsync());
    }
}
