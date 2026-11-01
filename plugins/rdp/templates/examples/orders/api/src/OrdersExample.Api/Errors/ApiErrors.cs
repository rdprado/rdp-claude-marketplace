// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.AspNetCore.Mvc;
using OrdersExample.Application.Errors;
using OrdersExample.Application.UseCases;

namespace OrdersExample.Api.Errors;

// The one error shape: { "error": { "code": "<kebab-case>", "fields"?: { "<field>": "<code>" } } }.
public static class ApiErrors
{
    public static object Body(string code, IReadOnlyDictionary<string, string>? fields = null)
        => new { error = new { code, fields } };

    public static IActionResult Of(int status, string code, IReadOnlyDictionary<string, string>? fields = null)
        => new ObjectResult(Body(code, fields)) { StatusCode = status };

    /// <summary>
    /// A use case's failure as HTTP. Example: <c>ApiErrors.FromOutput(output.Status, output.ErrorCode)</c>.
    /// </summary>
    public static IActionResult FromOutput(
        OutputStatus status, string code, IReadOnlyDictionary<string, string>? fields = null) => status switch
        {
            OutputStatus.Validation => Of(StatusCodes.Status400BadRequest, code, fields),
            OutputStatus.NotFound => Of(StatusCodes.Status404NotFound, code),
            OutputStatus.Conflict => Of(StatusCodes.Status409Conflict, code),
            _ => Of(StatusCodes.Status500InternalServerError, ErrorCodes.Unexpected),
        };

    // A status the pipeline set with no body (no endpoint 404, wrong method 405, wrong Content-Type 415...).
    public static string FromStatusCode(int status) => status switch
    {
        StatusCodes.Status401Unauthorized => ErrorCodes.Unauthorized,
        StatusCodes.Status403Forbidden => ErrorCodes.Forbidden,
        StatusCodes.Status404NotFound => ErrorCodes.NotFound,
        StatusCodes.Status405MethodNotAllowed => ErrorCodes.MethodNotAllowed,
        StatusCodes.Status415UnsupportedMediaType => ErrorCodes.UnsupportedMediaType,
        >= StatusCodes.Status500InternalServerError => ErrorCodes.Unexpected,
        _ => ErrorCodes.BadRequest,
    };

    // Bad JSON or a wrong type ("quantity": "ten") never reaches the use case. A JSON path key ("$.quantity")
    // names the field; other keys (the whole body) give no field.
    public static IActionResult FromModelState(ActionContext context)
    {
        var fields = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0 && entry.Key.StartsWith("$.", StringComparison.Ordinal))
            .ToDictionary(entry => entry.Key[2..], _ => ErrorCodes.Invalid);
        return Of(StatusCodes.Status400BadRequest, ErrorCodes.ValidationFailed, fields.Count > 0 ? fields : null);
    }
}
