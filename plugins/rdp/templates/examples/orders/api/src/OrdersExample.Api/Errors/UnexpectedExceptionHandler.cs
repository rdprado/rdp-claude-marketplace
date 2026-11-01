// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.AspNetCore.Diagnostics;
using OrdersExample.Application.Errors;

namespace OrdersExample.Api.Errors;

// The global exception handler: logs the full exception once and answers 500 "unexpected".
// Never the message or the stack on the wire, in any environment.
public sealed class UnexpectedExceptionHandler(ILogger<UnexpectedExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        logger.LogError(exception, "Unexpected error on {Method} {Path}",
            httpContext.Request.Method, httpContext.Request.Path);
        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(ApiErrors.Body(ErrorCodes.Unexpected), cancellationToken);
        return true;
    }
}
