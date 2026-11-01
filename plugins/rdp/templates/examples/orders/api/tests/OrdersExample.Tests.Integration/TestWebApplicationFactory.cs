// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using OrdersExample.Infrastructure.OrdersRepository;
using Serilog.Core;

namespace OrdersExample.Tests.Integration;

/// <summary>
/// The real app in a "Testing" environment: SQLite in-memory (its own connection per factory, so test
/// classes never share a database), a fixed clock, and JwtBearer trusting a known test key instead of an
/// identity provider. The dev identity provider is off here, as in HML/PRD.
/// </summary>
public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    public const string Issuer = "https://identity.test";
    public const string Audience = "orders-example-api";
    public const string UserId = "0b7e5f2a-9c1d-4f3e-8a6b-2d4c6e8f0a1b";

    // Test-only key: it signs and validates tokens in these tests and nowhere else.
    public static readonly SymmetricSecurityKey SigningKey =
        new(Encoding.UTF8.GetBytes("orders-example-integration-tests-signing-key"));

    // Each factory writes its logs to its own folder, so parallel test classes never share a file.
    private readonly string _logsFolder =
        Path.Combine(Path.GetTempPath(), "OrdersExample.Tests", Guid.NewGuid().ToString("N"));

    // Every log event the app writes, to check by property.
    public CapturedLogEvents LogEvents { get; } = new();

    public FakeTimeProvider Time { get; } = new(new DateTimeOffset(2026, 1, 15, 12, 0, 0, TimeSpan.Zero));

    public HttpClient CreateAuthenticatedClient()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", MintToken());
        return client;
    }

    // JwtBearer checks "exp" against the real clock, so the token's lifetime is relative to the real now.
    // No "nbf"/"iat": the fake clock of the use cases is in the past and must not make the token "not yet valid".
    public static string MintToken(
        SecurityKey? signingKey = null, DateTime? expires = null, string audience = Audience)
        => new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = audience,
            Claims = new Dictionary<string, object> { [JwtRegisteredClaimNames.Sub] = UserId },
            Expires = expires ?? TimeProvider.System.GetUtcNow().UtcDateTime.AddHours(1),
            SigningCredentials = new SigningCredentials(signingKey ?? SigningKey, SecurityAlgorithms.HmacSha256),
        });

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        await db.Orders.ExecuteDeleteAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Logs:FilePath"] = Path.Combine(_logsFolder, "log.txt"),
            ["Logs:AuditFilePath"] = Path.Combine(_logsFolder, "audit.txt"),
            ["Auth:Authority"] = Issuer,
            ["Auth:Audience"] = Audience,
        }));
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<ILogEventSink>(LogEvents);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Time);
            services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, jwt =>
            {
                // No discovery document to fetch: the issuer is checked by name and the test key verifies the signature.
                jwt.Authority = null;
                jwt.TokenValidationParameters.ValidIssuer = Issuer;
                jwt.TokenValidationParameters.IssuerSigningKey = SigningKey;
            });
            ConfigureTestDoubles(services);
        });
    }

    // Subclasses swap a service for a named test double here.
    protected virtual void ConfigureTestDoubles(IServiceCollection services)
    {
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing || !Directory.Exists(_logsFolder))
            return;
        try
        {
            Directory.Delete(_logsFolder, recursive: true);
        }
        catch (IOException)
        {
            // A log file still held open by the OS; it is only a temp folder, leaving it is harmless.
        }
    }
}
