// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Collections.Concurrent;
using Serilog.Core;
using Serilog.Events;

namespace OrdersExample.Tests.Integration;

/// <summary>
/// A Serilog sink that keeps the events in memory, so tests check their properties instead of the log text.
/// Example: <c>factory.LogEvents.From("Audit").Single().Property("Status")</c>.
/// </summary>
public sealed class CapturedLogEvents : ILogEventSink
{
    private readonly ConcurrentQueue<LogEvent> _events = new();

    public void Emit(LogEvent logEvent) => _events.Enqueue(logEvent);

    public IReadOnlyList<LogEvent> From(string sourceContext)
        => _events.Where(e => Property(e, "SourceContext") as string == sourceContext).ToList();

    public static object? Property(LogEvent logEvent, string name)
        => logEvent.Properties.TryGetValue(name, out var value) && value is ScalarValue scalar ? scalar.Value : null;
}
