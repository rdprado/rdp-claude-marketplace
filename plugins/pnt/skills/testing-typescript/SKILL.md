---
name: testing-typescript
description: PnT testing rules for TypeScript / React (Jest, AAA, fixed time, mock only at boundaries). Use when adding or changing tests in TS.
---
# Testing — TypeScript / React (Native)

How we write tests in TypeScript projects. This is the TS counterpart of the `testing` skill (.NET) — same discipline (AAA, fixed time, mock only at boundaries, one concept per test), idiomatic Jest stack.

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

- **Jest** — the project's runner (`jest-expo` preset for RN). `describe` / `it` / `test`.
- **`@testing-library/react-native`** for component tests — query by accessible role/text, assert on what the user sees. Never assert on component internals or instance state.
- **Plain `expect(...)`** matchers — `toBe`, `toEqual`, `toHaveBeenCalledWith`, `toThrow`. No custom assertion libraries beyond `@testing-library/jest-native` matchers (`toBeVisible`, `toHaveTextContent`).
- **Hand-built fakes for ports** over `jest.mock` of SDKs. Because boundaries are interfaces (see the `clean-architecture-typescript` skill), a fake is a small object literal implementing the port — clearer than module mocking.
- **Build test data by hand:** `new Strategy({ ... })`, `{ userId: 'u-1' }`. No factory libraries, no `faker`.
- **Time is fixed** (see below).

## What gets a unit test, what doesn't

Mirrors `.claude/pnt-standards.md` → "Testability":

- **Unit-test:** use cases, validators, entity methods, mappers (raw→DTO→entity), pure helpers. No real I/O — every boundary is a fake port injected into the use case.
- **Don't unit-test:** the port implementations themselves (`SignalRStrategyRepository`, `ExpoSecureStorage`). They cross a boundary; cover them with integration tests against a test server / emulator, or accept they're thin enough to verify by inspection.
- **Component tests:** render with React Native Testing Library, drive via user interactions, assert on output. Inject fake use cases via the Context provider.

## Naming

- Test file sits next to the unit under test or in `__tests__/`: `createTwapStrategy.test.ts`.
- Describe block = the unit under test: `describe('createTwapStrategy', ...)`.
- Test name = `Scenario_Expected`, readable as a sentence with `it`:
  - `it('returns a validation error when userId is empty', ...)`
  - `it('rejects when startTime is after endTime', ...)`
  - This is the TS reading of the .NET `Method_Scenario_Expected` convention — the method is the `describe`, the rest is the `it`.

## Structure

Every test has explicit `// Arrange`, `// Act`, `// Assert` comments. One Act per test. Multiple assertions on the same concept are fine; testing unrelated things isn't.

When several tests do the same thing with different inputs, collapse them with `it.each([...])` instead of repeating `it`s — the TS equivalent of `[Theory]` / `[InlineData]`.

```ts
// application/use-cases/listGoals/listGoals.test.ts
import { listGoals } from './listGoals';
import { GoalRepository } from '@application/ports/GoalRepository';

describe('listGoals', () => {
  it('returns a validation error when userId is empty', async () => {
    // Arrange
    const repo: jest.Mocked<GoalRepository> = { list: jest.fn() };
    const input = { userId: '', status: 'all', skip: 0, take: 10 } as const;

    // Act
    const output = await listGoals(input, { repo });

    // Assert
    expect(output.status).toBe('validation');
    expect(repo.list).not.toHaveBeenCalled(); // validation rejected → repo never called
  });

  it('returns the goals from the repository on success', async () => {
    // Arrange
    const repo: jest.Mocked<GoalRepository> = {
      list: jest.fn().mockResolvedValue([{ id: 'g-1' }]),
    };
    const input = { userId: 'u-1', status: 'all', skip: 0, take: 10 } as const;

    // Act
    const output = await listGoals(input, { repo });

    // Assert
    expect(output.status).toBe('success');
    if (output.status === 'success') {
      expect(output.value.goals).toHaveLength(1);
    }
  });
});
```

> Narrowing on `output.status` before reading `output.value` is required by the `Result` discriminated union — the test exercises the same exhaustive switch the production code does.

If a test body isn't self-explanatory — odd setup values, subtle path, non-obvious assertion — add a few lines of comment explaining what's being verified. The name and AAA structure handle the rest.

## Fakes and mocks

Mock **only at the boundary** (the ports). Never mock the unit under test, never mock pure domain functions.

Two acceptable forms:

1. **`jest.fn()` on a typed port** — best when you need to assert calls (`toHaveBeenCalledWith`, `not.toHaveBeenCalled`):

```ts
const repo: jest.Mocked<StrategyRepository> = { create: jest.fn(), cancel: jest.fn() };
```

2. **Hand-written fake** — best when you need stateful behavior across calls (an in-memory store):

```ts
function fakeStrategyRepo(): StrategyRepository {
  const store = new Map<string, Strategy>();
  return {
    create: async (s) => void store.set(s.id, s),
    cancel: async (id) => void store.delete(id),
  };
}
```

Set up behavior inline per test with `mockResolvedValue` / `mockReturnValue`. Use `not.toHaveBeenCalled()` to assert a path was *not* taken (validation rejected → repository never called).

## Time is injected

Domain code never calls `new Date()` / `Date.now()` directly — it takes a `Clock` port (see the `clean-architecture-typescript` skill). Tests pass a fixed clock:

```ts
const clock: Clock = { now: () => new Date('2026-05-29T10:00:00Z') };
const output = await createTwapStrategy(input, { repo, clock });
```

For presentation code that genuinely depends on timers (debounce, intervals), use Jest fake timers — never real waits:

```ts
jest.useFakeTimers();
// ...
jest.advanceTimersByTime(1000);
```

Never use a real delay/`setTimeout`-based wait to "let async work finish." Await the promise, or use `await waitFor(...)` from Testing Library.

## Component tests

Render through the public surface; assert on what the user sees. Inject fake use cases via the Context provider so no real SDK is touched.

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

it('shows the validation message when submit fails', async () => {
  // Arrange
  const createTwapStrategy = jest.fn().mockResolvedValue({ status: 'validation', error: 'startTime after endTime' });
  render(
    <UseCasesContext.Provider value={{ createTwapStrategy } as any}>
      <CreateTwapScreen />
    </UseCasesContext.Provider>
  );

  // Act
  fireEvent.press(screen.getByText('Enviar'));

  // Assert
  await waitFor(() => expect(screen.getByText('startTime after endTime')).toBeVisible());
});
```

- Query by role / accessible text, not by `testID` unless there's no accessible handle.
- Don't reach into component state or props. Drive it like a user and read the rendered output.

## Coverage expectations

- Every use case has tests for: the happy path, each validation branch, and each `Result` status it can return.
- Every validator has tests for each rule (valid + each failure).
- Entity invariant methods (`canBeCancelled`, etc.) have a test per branch.
- Mappers have a round-trip / known-input test.

When adding tests to a project with low coverage, start with use cases and validators — that is where business risk concentrates, and they are pure functions with injected ports, so they're cheap to cover.

## Don't

- Don't use `any` to silence the type checker in tests, except at a Context provider seam where a partial fake is intentional (cast narrowly, not the whole tree).
- Don't add `faker`, `test-data-bot`, or factory libraries. Build data by hand.
- Don't `jest.mock('expo-secure-store')` or mock SDKs module-wide when a typed fake port does the job — mock at the boundary you own.
- Don't use real timers or sleeps to wait for async work. Await, or use fake timers / `waitFor`.
- Don't assert on implementation details (internal state, private fields, call order that doesn't matter).
- Don't mock the unit under test or pure domain functions.
- Don't leave `it.skip` / `xit` marked "broken" in the suite. Fix it or delete it.
- Don't catch an error in a test to make it green. If production code throws, the test should fail.
- Don't share mutable state between tests. Each test builds its own data; reset fakes in `beforeEach` if reused.
