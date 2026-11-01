// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using OrdersExample.DevIdentityProvider.Controllers;

namespace OrdersExample.DevIdentityProvider;

public static class DependencyInjection
{
    /// <summary>
    /// The fake identity provider under /dev-idp, and the API's JwtBearer set to trust its key.
    /// Call only in Development, after AddApi (its JwtBearer settings override the API's).
    /// </summary>
    public static IServiceCollection AddDevIdentityProvider(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<DevIdentityProviderOptions>(configuration.GetSection(DevIdentityProviderOptions.SectionName));
        services.AddSingleton<DevSigningKey>();
        services.AddSingleton<DevAuthorizationCodes>();
        services.AddSingleton<DevRefreshTokens>();
        services.AddSingleton<DevAccessTokenIssuer>();
        services.AddControllers().AddApplicationPart(typeof(DevIdentityProviderController).Assembly);

        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<DevSigningKey, IOptions<DevIdentityProviderOptions>>((jwt, key, idp) =>
            {
                // No Authority: the key is right here, there is no discovery document to fetch.
                jwt.Authority = null;
                jwt.TokenValidationParameters.ValidIssuer = idp.Value.Issuer;
                jwt.TokenValidationParameters.ValidAudience = idp.Value.Audience;
                jwt.TokenValidationParameters.IssuerSigningKey = key.SecurityKey;
            });
        return services;
    }
}
