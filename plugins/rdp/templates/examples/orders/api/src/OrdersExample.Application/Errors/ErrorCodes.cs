// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Application.Errors;

// Stable codes the client translates. Never text for the user.
public static class ErrorCodes
{
    public const string Unexpected = "unexpected";
    public const string Unauthorized = "unauthorized";
    public const string ValidationFailed = "validation-failed";
    public const string ClientOrderIdReused = "client-order-id-reused";

    // What ASP.NET Core answers on its own (no endpoint, wrong method, wrong Content-Type...).
    public const string BadRequest = "bad-request";
    public const string Forbidden = "forbidden";
    public const string NotFound = "not-found";
    public const string MethodNotAllowed = "method-not-allowed";
    public const string UnsupportedMediaType = "unsupported-media-type";

    // Field codes, inside "fields" of a validation-failed error.
    public const string Required = "required";
    public const string Invalid = "invalid";
    public const string MustBePositive = "must-be-positive";
}
