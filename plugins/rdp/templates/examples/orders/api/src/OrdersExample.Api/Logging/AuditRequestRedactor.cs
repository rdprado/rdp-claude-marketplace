// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Text.Json;
using System.Text.Json.Nodes;

namespace OrdersExample.Api.Logging;

/// <summary>
/// Hides sensitive values in a request JSON before it reaches the audit log (LGPD: no tokens, emails, CPF).
/// Example: <c>Redact("{\"password\":\"x\",\"symbol\":\"PETR4\"}")</c> gives <c>{"password":"***","symbol":"PETR4"}</c>.
/// </summary>
public static class AuditRequestRedactor
{
    public const string Hidden = "***";
    public const string NotJson = "(not JSON)";
    public const string TooLarge = "(too large)";

    // A field whose name contains one of these (case and '_' / '-' ignored) is hidden.
    private static readonly string[] SensitiveNameParts =
        ["password", "secret", "token", "authorization", "apikey", "cpf", "email"];

    public static string? Redact(string? json)
    {
        if (json is null or TooLarge)
            return json;

        JsonNode? root;
        try
        {
            root = JsonNode.Parse(json);
        }
        catch (JsonException)
        {
            // Not JSON despite the header: the endpoint answers 400; the raw text could hold anything, so don't log it.
            return NotJson;
        }

        HideSensitive(root);
        return root?.ToJsonString();
    }

    private static void HideSensitive(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                foreach (var name in obj.Select(property => property.Key).ToList())
                {
                    if (IsSensitive(name))
                        obj[name] = Hidden;
                    else
                        HideSensitive(obj[name]);
                }
                break;
            case JsonArray array:
                foreach (var item in array)
                    HideSensitive(item);
                break;
        }
    }

    private static bool IsSensitive(string name)
    {
        var normalized = name.Replace("_", "").Replace("-", "").ToLowerInvariant();
        return SensitiveNameParts.Any(normalized.Contains);
    }
}
