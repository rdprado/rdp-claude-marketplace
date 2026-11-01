// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace OrdersExample.Tests.Integration;

public class OrdersEndpointTests(TestWebApplicationFactory factory) : IClassFixture<TestWebApplicationFactory>
{
    private const string Orders = "/api/v1/orders";

    [Fact]
    public async Task Create_WithValidInput_Returns201WithTheOrder()
    {
        // Arrange
        await factory.ResetDatabaseAsync();
        var client = factory.CreateAuthenticatedClient();
        var now = factory.Time.GetUtcNow();

        // Act
        var response = await client.PostAsJsonAsync(Orders, new { clientOrderId = Guid.NewGuid(), symbol = "petr4", side = "buy", quantity = 100, price = 37.5m });

        // Assert
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var order = await ReadJsonAsync(response);
        var id = order.GetProperty("id").GetString();
        Assert.Equal($"/api/v1/orders/{id}", response.Headers.Location?.ToString());
        Assert.Equal("PETR4", order.GetProperty("symbol").GetString());
        Assert.Equal("buy", order.GetProperty("side").GetString());
        Assert.Equal(100, order.GetProperty("quantity").GetInt32());
        Assert.Equal(37.5m, order.GetProperty("price").GetDecimal());
        Assert.Equal(now, order.GetProperty("createdAt").GetDateTimeOffset());
    }

    [Fact]
    public async Task Create_SentTwiceWithTheSameClientOrderId_Returns200WithTheFirstOrderAndStoresOne()
    {
        // Arrange
        await factory.ResetDatabaseAsync();
        var client = factory.CreateAuthenticatedClient();
        var body = new { clientOrderId = Guid.NewGuid(), symbol = "PETR4", side = "buy", quantity = 100, price = 37.5m };
        var first = await ReadJsonAsync(await client.PostAsJsonAsync(Orders, body));

        // Act
        var response = await client.PostAsJsonAsync(Orders, body);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(first.GetProperty("id").GetString(), (await ReadJsonAsync(response)).GetProperty("id").GetString());
        Assert.Single((await ReadJsonAsync(await client.GetAsync(Orders))).EnumerateArray());
    }

    [Fact]
    public async Task Create_WithTheClientOrderIdOfAnotherOrder_Returns409()
    {
        // Arrange
        await factory.ResetDatabaseAsync();
        var client = factory.CreateAuthenticatedClient();
        var clientOrderId = Guid.NewGuid();
        await client.PostAsJsonAsync(Orders, new { clientOrderId, symbol = "PETR4", side = "buy", quantity = 100, price = 37.5m });

        // Act
        var response = await client.PostAsJsonAsync(Orders, new { clientOrderId, symbol = "PETR4", side = "buy", quantity = 200, price = 37.5m });

        // Assert
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("""{"error":{"code":"client-order-id-reused"}}""", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Create_WithEveryFieldWrong_Returns400WithEveryFieldCode()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();

        // Act
        var response = await client.PostAsJsonAsync(Orders, new { symbol = "", side = "hold", quantity = 0, price = -1 });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            """{"error":{"code":"validation-failed","fields":{"clientOrderId":"required","symbol":"required","side":"invalid","quantity":"must-be-positive","price":"must-be-positive"}}}""",
            await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Create_WithMalformedJson_Returns400ValidationFailed()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();
        var body = new StringContent("not json", Encoding.UTF8, "application/json");

        // Act
        var response = await client.PostAsync(Orders, body);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"error":{"code":"validation-failed"}}""", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Create_WithWrongType_Returns400NamingTheField()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();
        var body = new StringContent(
            """{"symbol":"PETR4","side":"buy","quantity":"ten","price":1}""", Encoding.UTF8, "application/json");

        // Act
        var response = await client.PostAsync(Orders, body);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            """{"error":{"code":"validation-failed","fields":{"quantity":"invalid"}}}""",
            await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task List_ReturnsOrdersNewestFirst()
    {
        // Arrange
        await factory.ResetDatabaseAsync();
        var client = factory.CreateAuthenticatedClient();
        await CreateAsync(client, "OLDER");
        factory.Time.Advance(TimeSpan.FromMinutes(1));
        await CreateAsync(client, "NEWER");

        // Act
        var response = await client.GetAsync(Orders);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var symbols = (await ReadJsonAsync(response)).EnumerateArray().Select(o => o.GetProperty("symbol").GetString());
        Assert.Equal(["NEWER", "OLDER"], symbols);
    }

    private static async Task CreateAsync(HttpClient client, string symbol)
    {
        var response = await client.PostAsJsonAsync(Orders, new { clientOrderId = Guid.NewGuid(), symbol, side = "sell", quantity = 1, price = 10m });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
        => JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
}
