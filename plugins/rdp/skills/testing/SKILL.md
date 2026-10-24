---
name: testing
description: RDP testing rules for .NET (xUnit, Moq, AAA, fixed time, what to mock). Use when adding or changing tests in .NET.
---
# Testing

How we write tests. 

## Tests are the guardrail — review them carefully

When the AI writes tests, **prompt the user to review them**, and push harder for a test review than a code review when attention is limited. For AI-written code, the test is the guardrail: the code takes its shape from what the test asserts, so a wrong test propagates silently as green.

What to read for:

- What's actually being asserted, not just that it passes.
- Whether the test name matches the assertion.
- Whether obvious edge cases are missing.
- Whether mocks reflect production behavior, not what makes the test green.

## TDD

- Write the failing test before you change the code, and see it fail for the reason you expect.
- Make the smallest change that makes it pass.
- If an honest test is impractical, don't write a bad one; say so.
- Test behavior, not implementation: the test calls the code the way its user does and checks the result that user would see.
- If a test would still pass when every function returned nothing, throw it out.

## Stack

- **xUnit** — `[Fact]`, `[Theory]` + `[InlineData]`.
- **Moq** for mocks. No NSubstitute, no FakeItEasy.
- **Plain `Assert.*`** — `Assert.Equal`, `Assert.True`, `Assert.IsType<>`, `Assert.Contains`. No FluentAssertions, no Shouldly.
- Build test data by hand: `new Goal { ... }`, `new RegisterGoalInput(...)`. No Bogus, no AutoFixture, no builders.
- **Dates are fixed.** Tests pass concrete `DateTime` values, never `DateTime.Now`, `DateTime.UtcNow`, or anything random. Production code takes a `TimeProvider` (built into .NET 8+) so tests inject a known value — `FakeTimeProvider` from `Microsoft.Extensions.TimeProvider.Testing` is the one allowed test helper for this.

## Projects

Two test projects per solution:

- **`Tests.Unit`** — one class-under-test per test class. No real I/O: no database of any kind (not even in-memory), no Docker, no `HttpClient`, no filesystem, no clock. Anything that crosses a boundary lives behind an interface and gets a `Mock<T>`.
- **`Tests.Integration`** — real components working together, with fakes only at the outer edge. Examples: a repository against SQLite in-memory; an endpoint through the app pipeline via `WebApplicationFactory<Program>`. Not end to end: no real database server, network or external service.

What goes where:

- **Unit:** use cases, validators, mappers, domain rules, controller mapping (use case mocked).
- **Integration:** repositories against the in-memory database, and endpoints with their DI wiring.
- Boundary implementations (repositories, HTTP clients) get no unit tests; integration tests cover them.

## Naming

- Test class: `<ClassUnderTest>Tests` (e.g., `RegisterGoalUseCaseTests`, `BeehiveControllerTests`).
- Test method: `Method_Scenario_Expected`:
  - `ExecuteAsync_WhenUserIdIsEmpty_ReturnsValidationError`
  - `Login_WithValidCredentialsAndConfirmedEmail_Returns200WithAccessToken`

## Structure

Every test has explicit `// Arrange`, `// Act`, `// Assert` comments. One Act per test. Multiple assertions on the same concept are fine; testing unrelated things isn't.

When several tests do the same thing with different inputs, collapse them into a `[Theory]` with `[InlineData(...)]` rows instead of repeating `[Fact]`s.

If the test body isn't self-explanatory — odd setup values, subtle path, non-obvious assertion — add a few lines of comment explaining what's being verified. The method name and AAA structure handle the rest.

```csharp
[Fact]
public async Task ExecuteAsync_WhenUserIdIsEmpty_ReturnsValidationError()
{
    // Arrange
    var input = new ListGoalsInput(Guid.Empty, GoalStatusFilter.All, 0, 10);

    // Act
    var output = await _useCase.ExecuteAsync(input);

    // Assert
    Assert.False(output.IsSuccess);
    Assert.Equal(OutputStatus.Validation, output.Status);
    _goalRepositoryMock.Verify(
        r => r.ListAsync(It.IsAny<Guid>(), It.IsAny<GoalStatusFilter>(), 0, 10),
        Times.Never);
}
```

## Mocks

Mocks are fields on the test class, instantiated in the constructor; the system under test is wired up there too:

```csharp
public class ListGoalsUseCaseTests
{
    private readonly Mock<IGoalRepository> _goalRepositoryMock = new();
    private readonly ListGoalsUseCase _useCase;

    public ListGoalsUseCaseTests()
        => _useCase = new ListGoalsUseCase(_goalRepositoryMock.Object);
}
```

Set up behavior inline per test with `Setup(...)`. Use `Verify(..., Times.Never)` to assert a path was *not* taken (validation rejected → repository never called, etc.).

## Integration tests

Bootstrap the app via `WebApplicationFactory<Program>`, wrapped in a project-owned `TestWebApplicationFactory` that overrides `ConfigureWebHost` to:

- Swap external services for named test doubles (`TestEmailSender`, `FakeAiService`) so tests can inspect what would have been sent.
- Inject test config (JWT signing keys, etc.).

### Database: in-memory by default

- **EF-based projects: SQLite in-memory.** In the factory's `ConfigureServices` override, open a `SqliteConnection("DataSource=:memory:")`, keep it open for the factory's lifetime (the database disappears when the connection closes), register the `DbContext` with `UseSqlite(connection)`, and create the schema. Prefer it over the EF InMemory provider (`UseInMemoryDatabase`), which is not relational: it ignores foreign keys, unique indexes, and transactions, so tests pass that production would fail. Don't use the EF InMemory provider for new tests.
- **Non-EF projects:** hand-rolled in-memory repository implementations.
- **Reset state at the top of each test** with a `ResetDatabase()` / `Clear()` helper on the factory or test double — no Respawn, no `IAsyncLifetime`.
- **When in-memory can't reproduce the behavior, stop and ask.** If a test depends on something SQLite in-memory can't do faithfully — raw SQL or provider-specific SQL, stored procedures, provider-specific features (e.g. SQL Server types, JSON columns, collations), or concurrency/locking behavior — don't pick another approach yourself. Stop and ask the developer.

### Other dependencies (brokers, caches, external services)

Default to named test doubles registered in the factory. If a test genuinely needs the real thing (message broker, cache, external service), Docker or Testcontainers may be suggested — but **propose it and wait for approval before adding it.** Never add it on your own initiative.

### Parallelism

Tests must run in parallel. Each `TestWebApplicationFactory` instance owns its own SQLite connection, so test classes never share a database. If two tests collide, the fix is to remove the shared mutable state — not to serialize the suite. Watch for: static fields, singletons holding state, shared file paths, fixed ports, and test doubles registered as singletons in the factory. Each test owns its own data (seeded in Arrange, reset on teardown).

## Don't

- Don't add FluentAssertions, Shouldly, Bogus, AutoFixture, or NSubstitute. We use plain xUnit + Moq.
- Don't use a database or Docker in unit tests.
- Don't use the EF InMemory provider (`UseInMemoryDatabase`) for integration tests — use SQLite in-memory.
- Don't switch a database test away from SQLite in-memory on your own — stop and ask. Don't add Docker or Testcontainers for other dependencies without proposing it and getting approval (see *Integration tests*).
- Don't use `Thread.Sleep` to wait for async work.
- Don't leave `Skip = "broken"` attributes. Fix the test or delete it.
- Don't mock the class under test.
- Don't catch exceptions in a test to "make it green." If production code throws, the test should fail.
