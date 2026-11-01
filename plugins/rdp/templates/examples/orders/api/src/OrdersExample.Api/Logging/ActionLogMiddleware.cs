// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;

namespace OrdersExample.Api.Logging;

/// <summary>
/// Audit: every write to the API (POST/PUT/PATCH/DELETE under /api) is logged after its response to the
/// "Audit" category: the user id (sub, never the email), the action (method + route template), the route ids,
/// the status and the request JSON with sensitive fields hidden. Reads and /dev-idp are skipped.
/// A request that throws is still logged, as 500. A failure to log never fails the request.
/// </summary>
public sealed class ActionLogMiddleware(
    RequestDelegate next, ILoggerFactory loggerFactory, ILogger<ActionLogMiddleware> logger)
{
    public const string AuditCategory = "Audit";

    // Bodies bigger than this are not kept (the audit line says so).
    private const int MaxBodyChars = 64 * 1024;

    private static readonly HashSet<string> Writes =
        new(StringComparer.OrdinalIgnoreCase) { "POST", "PUT", "PATCH", "DELETE" };

    public async Task InvokeAsync(HttpContext context)
    {
        if (!Writes.Contains(context.Request.Method) || !context.Request.Path.StartsWithSegments("/api"))
        {
            await next(context);
            return;
        }

        var requestJson = await ReadRequestJsonAsync(context.Request);
        var failed = true;
        try
        {
            await next(context);
            failed = false;
        }
        finally
        {
            // An exception still on its way to the global handler will be a 500; the response doesn't say so yet.
            WriteAuditLineSafely(context, requestJson,
                failed ? StatusCodes.Status500InternalServerError : context.Response.StatusCode);
        }
    }

    private void WriteAuditLineSafely(HttpContext context, string? requestJson, int status)
    {
        try
        {
            WriteAuditLine(context, requestJson, status);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Audit: could not log {Method} {Path}", context.Request.Method, context.Request.Path);
        }
    }

    private void WriteAuditLine(HttpContext context, string? requestJson, int status)
    {
        // The factory caches the logger per category.
        var audit = loggerFactory.CreateLogger(AuditCategory);
        if (!audit.IsEnabled(LogLevel.Information))
            return;
        var template = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? context.Request.Path.Value;
        var routeIds = context.Request.RouteValues
            .Where(value => value.Key is not ("controller" or "action") && value.Value is not null)
            .ToDictionary(value => value.Key, value => value.Value?.ToString());
        // Classes log through ILogger<T> (never Serilog directly), with message templates, not interpolation.
        audit.LogInformation(
            "User {UserId} {Method} /{Action} {@RouteIds} -> {Status} request {Request}",
            context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value,
            context.Request.Method,
            template?.TrimStart('/'),
            routeIds,
            status,
            AuditRequestRedactor.Redact(requestJson));
    }

    // Reads the JSON body and rewinds it, so the controller still reads it. Null = no JSON body.
    private static async Task<string?> ReadRequestJsonAsync(HttpRequest request)
    {
        if (request.ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) != true)
            return null;

        request.EnableBuffering();
        using var reader = new StreamReader(request.Body, Encoding.UTF8, leaveOpen: true);
        var buffer = new char[MaxBodyChars + 1];
        var read = await reader.ReadBlockAsync(buffer, 0, buffer.Length);
        request.Body.Position = 0;
        return read > MaxBodyChars ? AuditRequestRedactor.TooLarge : new string(buffer, 0, read);
    }
}
