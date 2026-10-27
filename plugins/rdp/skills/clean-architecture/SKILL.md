---
name: clean-architecture
description: "RDP clean architecture for .NET: layers, dependency rules, use cases, entities, validation. Use when writing, reviewing or fixing code in a .NET clean-architecture project."
---
# Clean Architecture

How we structure .NET projects. 

## Layers

Innermost to outermost:

1. **Entities** — POCOs holding enterprise business rules and invariants (e.g. `Order.CanBeCancelled()`). Plain `class`, never `record` — entities have identity and mutable state, not value-equality semantics. No EF or validation attributes, no framework usings.
2. **Application** — use cases, their `Input`/`Output` records, repository interfaces (`IGoalRepository`), infra abstractions (`IEmailSender`; for time, inject the built-in `TimeProvider` rather than defining your own), validators, and the shared primitives (`OutputStatus`, `ValidationResult`). Nothing else. Depends only on Entities.
3. **Infrastructure** — EF `DbContext`, repository impls, external clients (email, JWT, AI). Implements Application interfaces. One project per concern (`Infrastructure/OrdersRepository`, `Infrastructure/EmailSender`) so consumers reference only what they need.
4. **Entry / Presentation** — the outer layer that runs the app. Web API uses controllers + request/response records; can equally be a WinForms form, a WPF ViewModel, or a console command. Holds no business logic — maps user input to a use case input, calls the use case, renders the output. Depends on Application (and Infrastructure at the composition root).

Dependencies point inward. Check `.csproj` `<ProjectReference>` entries when in doubt — Entities must have zero.

**Names:** the interface says what it provides, never the technology (`IGoalRepository`,
`IEmailSender`); the implementation puts the technology first (`EFGoalRepository`, `SmtpEmailSender`).

## Design rules

Testability:

- Code must be unit-testable. Anything that crosses a boundary — DB, HTTP, filesystem, clock, third-party SDK, framework API — lives behind an interface and is injected via the constructor.
- The implementations of those boundary interfaces (EF repositories, HTTP clients, framework adapters) don't need unit tests; they're covered by integration tests. Everything else — use cases, validators, mappers, domain rules — must be unit-testable without spinning up a framework or touching real tech.

Data and types:

- Get the data shape right before you write the logic.
- Make illegal states impossible: model the domain so an invalid value can't be written.
- Parse outside data once, where it comes in; trust it inside.
- Keep business logic in pure functions: data in, result out, no I/O.
- Don't silence the compiler or the type checker to make it build.
- Make operations idempotent: running twice, or again after a crash halfway, ends in the same state.
- Shared state: if two parts don't need the same mutable data, give each its own; if they do, allow one writer.

## Entry point: web example

The entry layer depends on what the app is — controllers, WinForms forms, WPF ViewModels, or console commands. The shape is the same in each case: receive user input, call a use case, map the `Output` back to the UI. The web example below is the most common; substitute as needed.

Use `[ApiController]` controllers. Reason: tests — controllers are trivially instantiable with mocked deps; Minimal API handlers are not. Routes versioned `api/v1/<resource>`.

```csharp
[ApiController]
[Route("api/v1/goals")]
public class GoalsController(IRegisterGoalUseCase registerGoal) : ControllerBase
{
    [HttpPost, Authorize]
    public async Task<IActionResult> Register([FromBody] RegisterGoalRequest req)
    {
        var output = await registerGoal.ExecuteAsync(req.ToInput());
        return output.Status switch
        {
            OutputStatus.Success    => Ok(output.ToResponse()),
            OutputStatus.Validation => BadRequest(output.ErrorMessage),
            OutputStatus.NotFound   => NotFound(output.ErrorMessage),
            _                       => StatusCode(500),
        };
    }
}
```

## Requests and responses: sealed records

API requests and responses are `sealed record` — `init` setters or positional params, never `set`. Requests live next to the controller (`Controllers/v1/Contracts/`); responses are mapped from the use case `Output`.

```csharp
public sealed record RegisterGoalRequest(string Title, DateTime? DueDate);
```

## Application: use cases

One feature = one folder. Two files inside:

- `<Feature>UseCase.cs` — input record, output record, interface, and use case implementation, separated by `// ---------- X ----------` comments.
- `<Feature>Validator.cs` — validator class alone, inside the same use case folder.

Outside of use cases, the default is **one class per file.**

```csharp
// Application/UseCases/ListUserCustomColors/ListUserCustomColorsUseCase.cs

// ---------- Input ----------
public sealed record ListUserCustomColorsInput(Guid UserId);

// ---------- Output ----------
public sealed record ListUserCustomColorsOutput(
    bool IsSuccess, string ErrorMessage, OutputStatus Status, IReadOnlyList<string> Colors)
{
    public static ListUserCustomColorsOutput Success(IReadOnlyList<string> colors)
        => new(true, string.Empty, OutputStatus.Success, colors);
    public static ListUserCustomColorsOutput Validation(string error)
        => new(false, error, OutputStatus.Validation, []);
}

// ---------- Interface ----------
public interface IListUserCustomColorsUseCase
{
    Task<ListUserCustomColorsOutput> ExecuteAsync(ListUserCustomColorsInput input);
}

// ---------- UseCase ----------
public sealed class ListUserCustomColorsUseCase(IUserCustomDefinitionRepository repo)
    : IListUserCustomColorsUseCase
{
    public async Task<ListUserCustomColorsOutput> ExecuteAsync(ListUserCustomColorsInput input)
    {
        var validation = ListUserCustomColorsValidator.Validate(input);
        if (!validation.IsValid)
            return ListUserCustomColorsOutput.Validation(validation.ErrorMessage);

        var colors = await repo.ListColorsByUserAsync(input.UserId);
        return ListUserCustomColorsOutput.Success(colors);
    }
}
```

```csharp
// Application/UseCases/ListUserCustomColors/ListUserCustomColorsValidator.cs

public static class ListUserCustomColorsValidator
{
    public static ValidationResult Validate(ListUserCustomColorsInput input)
    {
        if (input.UserId == Guid.Empty)
            return ValidationResult.Fail("UserId must not be empty.");
        return ValidationResult.Success;
    }
}
```

## Output, not exceptions

Use cases don't throw for expected failure paths (validation, not-found, conflict). They return an `Output` carrying `OutputStatus`, an error message, and payload fields; the controller's `switch` maps `OutputStatus` to HTTP status.

Exceptions are reserved for unexpected failures (DB down, third-party 500).

## Shared primitives

Two primitives appear in every project — keep them identical so use cases, controllers, and tests look the same everywhere.

`Application/Common/OutputStatus.cs`:

```csharp
namespace Application.Common;

public enum OutputStatus
{
    Success = 0,
    NotFound = 1,
    Validation = 2,
}
```

Add new members only when a new failure shape genuinely needs distinct HTTP mapping (e.g. `Conflict = 3`, `Forbidden = 4`). Don't add per-feature statuses.

`Application/Common/Validation/ValidationResult.cs`:

```csharp
using System.Diagnostics.CodeAnalysis;

namespace Application.Common.Validation;

public sealed record ValidationResult
{
    public static readonly ValidationResult Success = new(true, null);

    public static ValidationResult Fail(string message) => new(false, message);

    private ValidationResult(bool isValid, string? errorMessage)
    {
        IsValid = isValid;
        ErrorMessage = errorMessage;
    }

    // Tells the compiler ErrorMessage is non-null whenever IsValid is false,
    // so callers don't need `!` after checking IsValid.
    [MemberNotNullWhen(false, nameof(ErrorMessage))]
    public bool IsValid { get; }

    public string? ErrorMessage { get; }
}
```

Validators return `ValidationResult.Success` or `ValidationResult.Fail("...")`. Use cases check `IsValid` and, on failure, build an `Output` via the matching factory (e.g. `Output.Validation(result.ErrorMessage)` — no `!` needed after the check).

## Infrastructure: EF Core, repository per aggregate

`DbContext` is used directly inside repository implementations. No Unit of Work, no generic repository. One repository per aggregate root.

```csharp
public class EFGoalRepository(AppDbContext ctx) : IGoalRepository
{
    public async Task AddAsync(Goal goal)
    {
        await ctx.Goals.AddAsync(goal);
        await ctx.SaveChangesAsync();
    }
}
```

EF mapping (tables, keys, indexes) lives in `Infrastructure/.../Configurations/` via `IEntityTypeConfiguration<T>` — not as attributes on entities.

## DI: one extension method per project

Each project exposes a `DependencyInjection.cs` with a single `AddXxx()` extension named after the project. Infrastructure splits into multiple projects (one per concern), so it contributes multiple calls — not a single `AddInfrastructure(...)`. The composition root calls each:

```csharp
public static IServiceCollection AddApplication(this IServiceCollection services)
    => services
        .AddScoped<IRegisterGoalUseCase, RegisterGoalUseCase>()
        .AddScoped<IListGoalsUseCase, ListGoalsUseCase>();
```

`Program.cs` reads as `builder.Services.AddApplication().AddOrdersRepository(...).AddEmailSender(...).AddApi();` — one call per project, including each Infrastructure split.

In `Program.cs`, register a global exception handler (ASP.NET `UseExceptionHandler` middleware).

## Logging: Serilog

Serilog (`Serilog.AspNetCore`, `Serilog.Sinks.File`), wired only in `Program.cs`. Classes use
`ILogger<T>`, never Serilog. Console and a daily file in every environment; the file path and the
levels come from appsettings.

```csharp
const string logTemplate =
    "[{Timestamp:HH:mm:ss} {Level:u3}] [{RequestId}] [{SourceContext}] {Message:lj}{NewLine}{Exception}";
var logFilePath = builder.Configuration["Logs:FilePath"]
    ?? throw new InvalidOperationException("Logs:FilePath is missing in appsettings.");
builder.Services.AddSerilog((services, logger) => logger
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: logTemplate)
    .WriteTo.File(logFilePath, rollingInterval: RollingInterval.Day, outputTemplate: logTemplate));

app.UseSerilogRequestLogging(options => options.GetLevel = (http, elapsed, ex) =>
    ex != null || http.Response.StatusCode > 499 ? LogEventLevel.Error
    : elapsed > 5000 ? LogEventLevel.Warning
    : LogEventLevel.Information);
```

```json
"Logs": { "FilePath": "C:/logs/<app>/log.txt" },
"Serilog": { "MinimumLevel": { "Default": "Information", "Override": { "Microsoft": "Warning" } } }
```

- The file path is outside the app folder, so a deploy doesn't wipe it.
- `UseSerilogRequestLogging` after the static files, so pages with a token in the URL aren't logged.
- Message templates: `LogInformation("Order {OrderId} sent", id)`, not interpolation.
- Unexpected exceptions are logged once, by the global exception handler.
- Tests: `NullLogger<T>.Instance`.

## Tests

xUnit + Moq. Two projects:

- **`Tests.Unit`** — use cases with mocked repositories. One test class per use case.
- **`Tests.Integration`** — real components together: repositories against SQLite in-memory, endpoints through `TestWebApplicationFactory<Program>`. Unit tests never touch a database. Full rules — including when to stop and ask instead of using in-memory — are in the `testing` skill.

Test class names mirror the use case or endpoint. One `Arrange / Act / Assert` per test. No shared mutable fixture state.

## Auth and BFF

Sign-in, tokens, cookies and identity provider calls (e.g. `AuthController`): load `rdp:bff` with
the Skill tool and follow it.

## Don't

- Don't add MediatR, AutoMapper, or FluentValidation. Mapping is one line in the controller or use case; validation is a static class returning `ValidationResult`.
- Don't put EF or validation attributes (`[Required]`, `[Column]`, etc.) on entities. That's Infrastructure's job.
- Don't declare entities as `record`. Entities have identity and mutable state; value-equality is wrong for them. Use `class`.
- Don't return entities from controllers. Map to a response record.
- Don't reference `Infrastructure` from `Application`. Define an interface in Application; implement it in Infrastructure.
- Don't make a `Shared` or `Common` project for misfit code. If it doesn't fit a layer, the design is wrong.
- Don't dump helper classes, utility methods, or "service" types into Application. Application holds use cases, their I/O, interfaces, validators, and the shared primitives — nothing else. If a helper reasons about an entity's invariants or business rules, put it on the entity (or a domain service next to entities). If it touches IO, framework, parsing, serialization, time, or any external concern, define an interface in Application and implement it in Infrastructure. "I need a place for this helper" is a smell — find its real home.
- Don't throw from use cases for expected failure paths. Return an `Output` with the right `OutputStatus`.
- Don't use Minimal API endpoints — controllers test better.

## Avoid duplicated business rules

Write each business rule once, in a rules class (Entities or Application, e.g. `BodyRecordRules.DateProblem`). Use cases and validators call it; never copy it. A client may repeat the check only to warn before sending, using the same test cases. Before writing an `if` for a rule, search whether it already exists.

## Quality checks

.NET has no `dryer` or `crapper` yet: Sonar is the only check (see the `rdp:sonar` skill).
In a project with both .NET and TypeScript/JavaScript, `dryer` and `crapper` run only on
the TypeScript/JavaScript code (see `rdp:clean-architecture-typescript`).
