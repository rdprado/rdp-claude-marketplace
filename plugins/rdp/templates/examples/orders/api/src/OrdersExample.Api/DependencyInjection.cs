// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using OrdersExample.Api.Authentication;
using OrdersExample.Api.Errors;
using OrdersExample.Application.Errors;

namespace OrdersExample.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApi(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        // Only this assembly's controllers by default; the dev identity provider adds its own in Development.
        services.AddControllers()
            .ConfigureApplicationPartManager(parts => KeepOnly(parts, typeof(DependencyInjection).Assembly))
            .AddJsonOptions(json => ConfigureJson(json.JsonSerializerOptions))
            .ConfigureApiBehaviorOptions(api =>
            {
                api.InvalidModelStateResponseFactory = ApiErrors.FromModelState;
                // No ProblemDetails for 4xx results (415...): UseStatusCodePages writes the one error shape.
                api.SuppressMapClientErrors = true;
            });
        // Same JSON rules for what the pipeline writes outside MVC (401, 404, 405, 415, 500).
        services.ConfigureHttpJsonOptions(json => ConfigureJson(json.SerializerOptions));

        services.AddProblemDetails();
        services.AddExceptionHandler<UnexpectedExceptionHandler>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(jwt => ConfigureJwtBearer(jwt, configuration, environment));
        services.AddAuthorization();
        return services;
    }

    private static void KeepOnly(ApplicationPartManager parts, System.Reflection.Assembly assembly)
    {
        foreach (var part in parts.ApplicationParts.OfType<AssemblyPart>().Where(p => p.Assembly != assembly).ToList())
            parts.ApplicationParts.Remove(part);
    }

    private static void ConfigureJson(JsonSerializerOptions json)
    {
        json.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        json.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    }

    // The API trusts the Bearer token issued by the identity provider (Auth:Authority). In Development the
    // dev identity provider replaces Authority with its own key (AddDevIdentityProvider).
    private static void ConfigureJwtBearer(
        JwtBearerOptions jwt, IConfiguration configuration, IHostEnvironment environment)
    {
        var auth = configuration.GetSection(AuthOptions.SectionName).Get<AuthOptions>() ?? new AuthOptions();
        if (!environment.IsDevelopment()
            && (string.IsNullOrWhiteSpace(auth.Authority) || string.IsNullOrWhiteSpace(auth.Audience)))
            throw new InvalidOperationException("Auth:Authority and Auth:Audience must be set.");

        jwt.Authority = auth.Authority;
        jwt.Audience = auth.Audience;
        // Keep "sub" as "sub" (no mapping to the long .NET claim names).
        jwt.MapInboundClaims = false;
        jwt.TokenValidationParameters.ClockSkew = TimeSpan.FromSeconds(30);
        jwt.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.Headers.WWWAuthenticate = "Bearer";
                await context.Response.WriteAsJsonAsync(ApiErrors.Body(ErrorCodes.Unauthorized));
            },
        };
    }
}
