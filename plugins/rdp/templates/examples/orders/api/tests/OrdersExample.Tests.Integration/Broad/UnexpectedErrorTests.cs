// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OrdersExample.Application.Repositories;
using OrdersExample.Entities;
using OrdersExample.Tests.Integration.Infrastructure;

namespace OrdersExample.Tests.Integration.Broad;

// Broad integration test: an unexpected exception gives a 500 without its text, and the audit log still records the request.
public class UnexpectedErrorTests(UnexpectedErrorTests.BrokenDatabaseFactory factory)
    : IClassFixture<UnexpectedErrorTests.BrokenDatabaseFactory>
{
    [Fact]
    public async Task List_WhenTheDatabaseFails_Returns500UnexpectedWithoutTheExceptionText()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();

        // Act
        var response = await client.GetAsync("/api/v1/orders");

        // Assert
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("""{"error":{"code":"unexpected"}}""", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Create_WhenTheDatabaseFails_IsStillAuditedWithStatus500()
    {
        // Arrange
        var client = factory.CreateAuthenticatedClient();

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/orders", new { clientOrderId = Guid.NewGuid(), symbol = "audit3", side = "buy", quantity = 1, price = 10m });

        // Assert
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var audit = Assert.Single(factory.LogEvents.From("Audit"));
        Assert.Equal(TestWebApplicationFactory.UserId, CapturedLogEvents.Property(audit, "UserId"));
        Assert.Equal("POST", CapturedLogEvents.Property(audit, "Method"));
        Assert.Equal("api/v1/orders", CapturedLogEvents.Property(audit, "Action"));
        Assert.Equal(500, CapturedLogEvents.Property(audit, "Status"));
    }

    public sealed class BrokenDatabaseFactory : TestWebApplicationFactory
    {
        protected override void ConfigureTestDoubles(IServiceCollection services)
        {
            services.RemoveAll<IOrderRepository>();
            services.AddScoped<IOrderRepository, BrokenOrderRepository>();
        }
    }

    // Stands in for a database that is down.
    private sealed class BrokenOrderRepository : IOrderRepository
    {
        private const string Failure = "database is down: secret connection details";

        public Task<IReadOnlyList<Order>> ListAsync() => throw new InvalidOperationException(Failure);
        public Task<Order?> FindAsync(Guid id) => throw new InvalidOperationException(Failure);
        public Task<Order?> FindByClientOrderIdAsync(Guid clientOrderId) => throw new InvalidOperationException(Failure);
        public Task<bool> AddAsync(Order order) => throw new InvalidOperationException(Failure);
        public Task UpdateAsync(Order order) => throw new InvalidOperationException(Failure);
    }
}
