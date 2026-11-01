// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Api.Logging;

// Section "Logs". Paths outside the app folder, so a deploy doesn't wipe them.
public sealed class LogsOptions
{
    public const string SectionName = "Logs";

    public string FilePath { get; init; } = string.Empty;
    public string AuditFilePath { get; init; } = string.Empty;
    public int RetainedDays { get; init; } = 90;
}
