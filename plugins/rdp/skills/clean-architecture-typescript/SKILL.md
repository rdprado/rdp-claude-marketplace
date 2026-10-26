---
name: clean-architecture-typescript
description: "RDP rules for TypeScript / JavaScript — React, React Native, Svelte / SvelteKit and the BFF: language, clean architecture, use cases, quality checks. Use when writing, reviewing or fixing TS, TSX, JS or .svelte code."
---
# Clean Architecture — TypeScript / React (Native)

How we structure React and React Native projects in TypeScript. This is the TS counterpart of the `clean-architecture` skill (.NET) — same layering and dependency rules, idiomatic TS shapes.

> **The framework never dictates a pattern from the use case inward.**
> React, Svelte, Expo, a BFF — they live only in the Interface Adapters ring. From the use case
> on (use cases, ports, entities, infrastructure), the shapes are ours and match the .NET skill:
> an interface plus a class, dependencies through the constructor. A page or endpoint calls the
> use case **through its interface** and never does `new`; the only `new` lives in the
> composition root. Framework fashion (hooks, function-everything) stops at the adapter.
>
> Updated on 24/10/2026 and recommended by RDP. Some existing projects are organized differently
> (e.g. use cases as plain functions); new code follows this shape, and old code moves toward it
> when touched.

## TypeScript language

- No `any`. Use `unknown` and narrow, or define a real type. Reserve `any` for genuinely untyped seams (a partial test fake), cast narrowly, never blanket a whole module.
- **`strict` on.** `strictNullChecks` is non-negotiable — model absence with `T | null`/`T | undefined`, not with a loosened type.
- Prefer `type` aliases for data shapes and unions; `interface` for ports/contracts that implementations satisfy (`implements`). Be consistent within a file.
- Model "one of N shapes" with **discriminated unions** + a literal `kind`/`status` tag, and switch on the tag with no `default` — let the compiler force exhaustiveness when a case is added. This is how we represent results and states (see `Result` below).
- Make data **`readonly`** by default — `readonly` fields, `readonly T[]`, `as const`. Mutation is the exception, marked explicitly.
- Don't throw for expected failure paths (validation, not-found). Return a typed result. Exceptions are for unexpected failures — let them reach an error boundary / Sentry.
- No non-null assertions (`!`) to dodge null checks except immediately after a guard that proves it. Narrow instead.
- Avoid enums; prefer string-literal unions (`'success' | 'validation'`) — lighter, no runtime object, better narrowing. Use a `const` object + `as const` if you need the values at runtime.
- Inject side-effecting boundaries (clock, randomness, IO, SDKs) — never call `new Date()`, `Date.now()`, or `Math.random()` inside domain/business code. See *Ports* below.

## React / React Native

- Components are pure functions of props + state. No business rules in components — call a use case.
- Hooks follow the rules of hooks; custom hooks start with `use`. Keep `useEffect` dependency arrays honest — don't suppress the lint rule to hide a missing dep; fix the dep.
- Memoize (`useMemo`/`useCallback`/`React.memo`) to fix a measured render problem, not preemptively. Excess memoization is its own cost and noise.
- Lists that can grow use a virtualized list (`FlashList`/`FlatList`), never `.map()` into a `ScrollView`.
- Keep render-path work cheap. Heavy/streaming work (e.g. high-rate SignalR processing) belongs off the render path — a worklet, a throttle/batch, or the data layer — not inline in a component or effect.

## Formatting

`prettier`. Don't discuss style beyond that.

## node_modules

- **Never modify anything under `node_modules/` (or any installed-package directory).** It's generated from `package.json`/lockfile and gets blown away on install — edits there are silently lost and mask the real fix. If a dependency needs changing, do it the right way: bump the version, add a wrapper/adapter in our code, or use a tracked `patch-package` patch.
- Only enter `node_modules/` to **read** a package's public surface — interfaces, types, enums, parameter and return signatures — and only after reaching it through a project file (an `import` you're following), never by browsing the tree blind. Don't read package internals for any other reason.

## Layers

Innermost to outermost. **Dependencies point inward.** Inner layers never import from outer layers.

1. **Entities** — pure enterprise business rules. Entities, their invariants, and the value types that model the business. No React, no `expo-*`, no `axios`, no `@microsoft/signalr` imports. If you `import` a framework here, the layer is wrong.
2. **Application** — application business rules; a sibling of Entities, not nested under it. Use cases, their `Input`/`Output` types, port interfaces (`StrategyRepository`, `Clock`), validators, and the shared primitives (`Result`/`OutputStatus`, `ValidationResult`). Depends only on Entities. Still no framework imports.
3. **Infrastructure** — implementations of the application ports: API clients (Axios `WebBroker`), SignalR repositories, `SecureStore`, Sentry, Firebase, LaunchDarkly. Data-access adapters live under `infrastructure/data/`; other infra concerns (monitoring, config, feature flags) sit beside it. Each third-party SDK is wrapped behind an application port (an interface **owned by the Application layer**; see `.claude/rdp-standards.md` → "wrap third-party libs"). One module per concern.
4. **Interface Adapters** — the outer ring where **presentation and entry live together**. Presentation is a View pattern (MVVM / MVC / MVP / Passive View) — a React concern, not a Clean Architecture layer of its own; here it is the screens, components, custom hooks, and Zustand stores. Entry is the way input reaches the app: user clicks / Expo Router routes on the client, or HTTP endpoints on a backend. Both map user input to a use case input, call the use case, and render the `Output`. No business logic.
5. **Composition root** — wires concrete implementations to ports and provides them to the interface-adapters layer (see "Dependency injection" below).

> Rule of thumb: check the `import` lines. An `entities/` or `application/` file importing anything from `react`, `expo-*`, `axios`, `@microsoft/signalr`, or the interface-adapters layer is a layer violation.

### Mapping to the .NET standard

| .NET (the `clean-architecture` skill) | TypeScript / React |
|---|---|
| Entities | `entities/` — classes or types + pure functions |
| Application (use cases, I/O, interfaces, validators) | `application/use-cases/`, `application/ports/`, colocated validators, `application/common/` |
| Infrastructure (EF, clients) | `infrastructure/` — SDK wrappers; data-access under `infrastructure/data/` |
| Entry / Presentation (controllers) | `interface-adapters/` — screens, components, hooks, stores + entry (`app/` routes) |
| `OutputStatus` / `ValidationResult` | `Result<T>` discriminated union / `ValidationResult` |
| Use case interface + `sealed class`, constructor injection | Use case `interface` + `class`, constructor injection |
| DI extension methods | Composition root, hand-written (Pure DI); framework only delivers it (see below) |

## Design rules

Testability:

- Code must be unit-testable. Anything that crosses a boundary — DB, HTTP, filesystem, clock, third-party SDK, framework API — lives behind an interface and is injected via the constructor.
- The implementations of those boundary interfaces (HTTP clients, storage, framework adapters) don't need unit tests; they're covered by integration tests. Everything else — use cases, validators, mappers, domain rules — must be unit-testable without spinning up a framework or touching real tech.

Data and types:

- Get the data shape right before you write the logic.
- Make illegal states impossible: model the domain so an invalid value can't be written.
- Parse outside data once, where it comes in; trust it inside.
- Keep business logic in pure functions: data in, result out, no I/O.
- Don't silence the compiler or the type checker to make it build.
- Make operations idempotent: running twice, or again after a crash halfway, ends in the same state.
- Shared state: if two parts don't need the same mutable data, give each its own; if they do, allow one writer.

## Suggested folder layout

```
src/
├── entities/                       # Order, Strategy — enterprise rules & invariants
│   └── Strategy.ts
├── application/                    # application business rules (sibling of entities)
│   ├── use-cases/
│   │   └── createTwapStrategy/
│   │       ├── createTwapStrategy.ts            # Input, Output, interface, use case class
│   │       └── createTwapStrategy.validator.ts  # validator (colocated)
│   ├── ports/                      # StrategyRepository, Clock, SecureStorage (interfaces)
│   └── common/                     # Result, OutputStatus, ValidationResult
├── infrastructure/                 # implementations of application ports
│   ├── data/                       # data-access adapters
│   │   ├── signalr/                # implements MarketDataRepository
│   │   ├── webBroker/              # implements StrategyRepository (Axios)
│   │   └── secureStore/            # implements SecureStorage (expo-secure-store)
│   └── monitoring/                 # Sentry, Firebase, LaunchDarkly — non-data infra
├── interface-adapters/             # the View + entry (presentation patterns: MVVM/MVC/…)
│   ├── screens/
│   ├── components/
│   ├── hooks/
│   └── stores/                     # Zustand
├── composition/                    # composition root (DI wiring)
└── app/                            # Expo Router entry — route files that re-export from interface-adapters
```

> `app/` sits at the root because Expo Router requires it there, but it belongs to the **Interface Adapters** layer conceptually — it is the entry. Keep the route files thin: they re-export screens from `interface-adapters/screens/`.

> Existing projects don't have to move every file at once. The target shape is above; refactor toward it incrementally.

## Interface Adapters: where presentation and entry meet

In Clean Architecture the outermost ring of adapters — presentation, controllers/entry, and the gateways/repositories that talk to the outside world — is a single conceptual layer: **Interface Adapters**. They translate between the shapes the use cases speak (`Input`/`Output`, ports) and the shapes the outside world speaks (React props, HTTP payloads, SDK calls).

How that maps in this codebase:

- **Ports** (the interface each adapter implements) live in `application/ports/`. They are the contract; the adapter is one concrete side of it.
- **UI / entry adapters** live in `interface-adapters/`: screens, components, hooks, Zustand stores, and the entry points (`app/` routes, click handlers).
- **Infra adapters** — gateways and repositories that implement the ports against a real SDK — live in `infrastructure/` (data-access under `infrastructure/data/`). Conceptually they are Interface Adapters too; we keep the *concrete implementations* in Infrastructure so the outermost driver code (the SDKs themselves) stays isolated behind one wrapper each.

The takeaway: presentation is not a layer of its own — it is the View pattern used inside the Interface Adapters ring. Whether input arrives as a button click or an endpoint call, an adapter turns it into a use case `Input`, invokes the use case, and renders the `Output`.

## Entities

Entities hold enterprise business rules and invariants. Prefer a `class` when the entity has identity and behavior over its own state; prefer a `type` + pure functions when it is mostly data.

```ts
// entities/Strategy.ts
export class Strategy {
  constructor(
    readonly id: string,
    readonly startTime: Date,
    readonly endTime: Date,
    private status: StrategyStatus
  ) {}

  canBeCancelled(): boolean {
    return this.status === 'active' || this.status === 'paused';
  }
}
```

- No framework imports, no decorators, no validation attributes.
- Invariants that reason about the entity's own state are **methods on the entity**, not free-floating helpers in the interface-adapters layer.

## Use cases

One feature = one folder. Two files inside, mirroring the .NET layout:

- `<feature>.ts` — `Input` type, `Output` type, the use case interface and the use case class.
- `<feature>.validator.ts` — the validator function alone (colocated, still part of the Application layer).

A use case is an **interface plus a class**, exactly like .NET: the ports it needs come in through
the constructor, and `execute(input)` runs it. Callers depend on the interface only.

```ts
// application/use-cases/listUserCustomColors/listUserCustomColors.ts
import { Result } from '@application/common/Result';
import { UserCustomDefinitionRepository } from '@application/ports/UserCustomDefinitionRepository';
import { validateListUserCustomColors } from './listUserCustomColors.validator';

// ---------- Input ----------
export type ListUserCustomColorsInput = {
  readonly userId: string;
};

// ---------- Output ----------
export type ListUserCustomColorsOutput = {
  readonly colors: readonly string[];
};

// ---------- Interface ----------
export interface ListUserCustomColorsUseCase {
  execute(input: ListUserCustomColorsInput): Promise<Result<ListUserCustomColorsOutput>>;
}

// ---------- UseCase ----------
export class ListUserCustomColors implements ListUserCustomColorsUseCase {
  constructor(private readonly repo: UserCustomDefinitionRepository) {}

  async execute(input: ListUserCustomColorsInput): Promise<Result<ListUserCustomColorsOutput>> {
    const validation = validateListUserCustomColors(input);
    if (!validation.isValid) {
      return Result.validation(validation.errorMessage); // narrowed: no `!` needed
    }

    const colors = await this.repo.listColorsByUser(input.userId);
    return Result.success({ colors });
  }
}
```

- Always call it through the instance: `useCase.execute(input)`. Never pass `useCase.execute`
  loose as a callback (`onClick={useCase.execute}`): `this` is lost. Wrap it in an arrow.
- Validators and pure business rules stay functions (they hold no dependencies).

```ts
// application/use-cases/listUserCustomColors/listUserCustomColors.validator.ts
import { ValidationResult } from '@application/common/ValidationResult';
import { ListUserCustomColorsInput } from './listUserCustomColors';

export function validateListUserCustomColors(input: ListUserCustomColorsInput): ValidationResult {
  if (!input.userId) {
    return ValidationResult.fail('userId must not be empty.');
  }
  return ValidationResult.success;
}
```

### Why classes, not functions

The TS/React community often writes use cases as plain functions (`fn(input, deps)`), and says
"class only if stateful". We don't, on purpose:

- **The framework doesn't decide.** "Functions everywhere" is React/hooks culture. It belongs to
  the adapter ring; from the use case inward we follow clean architecture, not the UI library.
- **One model across languages.** A use case reads the same in C# and TS: interface, class,
  constructor, `execute`. Moving between the server and the client costs nothing.
- **The interface is the boundary.** Uncle Bob's use case is an Interactor behind an input port.
  The page depends on that interface, so a test or another screen can swap it.
- **No cost.** No performance difference (methods live on the prototype; use cases are built
  once), no Sonar rule against it, and about the same number of lines.

Both styles are valid clean architecture; this is our choice so every RDP project looks the same.

## Result, not exceptions

Use cases don't throw for expected failure paths (validation, not-found, conflict). They return a `Result` discriminated union carrying status and payload; the interface-adapters layer maps the status to UI. This is the TS counterpart of the .NET `Output` + `OutputStatus`.

Exceptions are reserved for unexpected failures (network down, SDK 500) — let those propagate to an error boundary / Sentry.

```ts
// application/common/Result.ts
export type OutputStatus = 'success' | 'notFound' | 'validation' | 'conflict';

export type Result<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'notFound'; readonly error: string }
  | { readonly status: 'validation'; readonly error: string }
  | { readonly status: 'conflict'; readonly error: string };

export const Result = {
  success: <T>(value: T): Result<T> => ({ status: 'success', value }),
  notFound: <T>(error: string): Result<T> => ({ status: 'notFound', error }),
  validation: <T>(error: string): Result<T> => ({ status: 'validation', error }),
  conflict: <T>(error: string): Result<T> => ({ status: 'conflict', error }),
};
```

The discriminated union is deliberate: `switch (result.status)` is exhaustively checked by TypeScript, so a new status forces every consumer to handle it — the same safety the .NET `switch` on `OutputStatus` gives.

## Shared primitives

Keep these identical across all TS projects so use cases, screens, and tests look the same everywhere — the TS mirror of the .NET `OutputStatus` / `ValidationResult`.

```ts
// application/common/ValidationResult.ts
export type ValidationResult =
  | { readonly isValid: true }
  | { readonly isValid: false; readonly errorMessage: string };

const success: ValidationResult = { isValid: true };

export const ValidationResult = {
  success,
  fail: (message: string): ValidationResult => ({ isValid: false, errorMessage: message }),
};
```

A discriminated union, like `Result`: after `if (!validation.isValid)`, TypeScript knows `errorMessage` is a `string`, so callers never need a non-null assertion.

Add a new `OutputStatus` member only when a new failure shape genuinely needs distinct UI mapping. Don't add per-feature statuses.

## Ports (the interfaces use cases depend on)

Every boundary — HTTP, WebSocket, secure storage, clock, analytics — is an interface in `application/ports/`. The use case depends on the interface; the implementation lives in `infrastructure/`.

```ts
// application/ports/StrategyRepository.ts
import { Strategy } from '@entities/Strategy';

export interface StrategyRepository {
  create(strategy: Strategy): Promise<void>;
  cancel(id: string): Promise<void>;
}

// application/ports/Clock.ts
export interface Clock {
  now(): Date;
}
```

> The `Clock` port matters specifically: validators and use cases that compare against "now" (e.g. the StartTime/EndTime strategy validation) must take a `Clock`, never call `new Date()` directly — otherwise they are not deterministically testable. See the `testing-typescript` skill → "Time is injected".

## Infrastructure: wrap every SDK

Each third-party SDK is wrapped behind an application port (an application interface, in Clean Architecture terms). The implementation is the only place the SDK is imported.

```ts
// infrastructure/data/secureStore/ExpoSecureStorage.ts
import * as SecureStore from 'expo-secure-store';
import { SecureStorage } from '@application/ports/SecureStorage';

export class ExpoSecureStorage implements SecureStorage {
  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  }
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  }
}
```

Benefits: Entities and Application never depend on `expo-*`; swapping or auditing a dependency touches one file; the SDK is mockable in tests; a supply-chain incident in one package is contained to its wrapper.

API mapping (raw payload → DTO → entity) lives in `infrastructure/data/` — not in components, not on entities.

## Interface Adapters: presentation (components, hooks, stores)

Presentation is the **only** place React, Expo, and Zustand appear. It is the View side of the Interface Adapters layer.

- **Screens / components** receive use case outputs and render them. No business rules, no direct SDK calls.
- **Custom hooks** orchestrate: call a use case, push the `Result` into a store, expose state to the component. A hook is where presentation meets the composition root.
- **Zustand stores** hold UI/view state. They do not contain business rules — those live in use cases.

```tsx
// interface-adapters/hooks/useCreateTwap.ts
export function useCreateTwap() {
  const { createTwapStrategy } = useUseCases(); // from composition root
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: CreateTwapInput) => {
      const result = await createTwapStrategy.execute(input); // the interface, never `new`
      switch (result.status) {
        case 'success':
          return true;
        case 'validation':
        case 'conflict':
        case 'notFound':
          setError(result.error);
          return false;
      }
    },
    [createTwapStrategy]
  );

  return { submit, error };
}
```

The `switch` has no `default` — TypeScript flags it if a new `OutputStatus` is added and not handled here.

## BFF (backend for frontend)

Who holds identity and the token (BFF inside the API or a separate BFF): load `rdp:bff` with the
Skill tool and follow it.

## Dependency injection

Two links, same as .NET:

- **Use case ← ports:** the repositories and tech (HTTP, storage, clock) come in through the
  use case constructor, typed as port interfaces.
- **Page / endpoint → use case:** it gets the use case **interface** and calls `execute`. It never
  does `new` and never imports the class.

The only `new` lives in the **composition root**, a plain module written by hand (Pure DI). It is
the TS equivalent of the .NET `AddApplication()/AddInfrastructure()` calls, and it is typed: a
missing dependency fails at compile time.

```ts
// composition/container.ts
export function buildContainer() {
  const strategyRepo = new SignalRStrategyRepository(/* ... */);
  const clock: Clock = new SystemClock();

  return {
    createTwapStrategy: new CreateTwapStrategy(strategyRepo, clock) as CreateTwapStrategyUseCase,
    // ...one entry per use case, typed as its interface
  };
}
```

We don't add a DI container library. TS erases types at runtime, so autowiring containers
(tsyringe, InversifyJS) need decorators and metadata that don't work with esbuild/Vite; Pure DI
needs nothing. The framework only **delivers** the container to the adapters: React Context, Svelte
`setContext`/`getContext`, or `event.locals` on a SvelteKit server.

React Context provides the container to the tree; `useUseCases()` reads it.

```tsx
const UseCasesContext = createContext<ReturnType<typeof buildContainer> | null>(null);
export const useUseCases = () => {
  const ctx = useContext(UseCasesContext);
  if (!ctx) throw new Error('useUseCases must be used within UseCasesProvider');
  return ctx;
};
```

> Tests never touch the container. They do `new CreateTwapStrategy(fakeRepo, fakeClock)` and call `execute` — that's the whole point of constructor injection.

## Don't

- Don't import `react`, `expo-*`, `axios`, or `@microsoft/signalr` from `entities/` or `application/`. Define a port; implement it in `infrastructure/`.
- Don't use `any`. Use `unknown` and narrow, or define a real type (see `.claude/rdp-standards.md`).
- Don't put business rules in components, hooks, or Zustand stores. Those belong in use cases and entities.
- Don't throw from use cases for expected failures (validation, not-found). Return a `Result`.
- Don't call `new Date()`, `Date.now()`, or `Math.random()` inside entities or application code. Inject a `Clock` / RNG port — otherwise it isn't testable.
- Don't reach into a third-party SDK from more than one place. Wrap it once behind a port.
- Don't create a `utils/` or `common/` dumping ground for misfit code. If a helper reasons about an entity's invariants, put it on the entity. If it touches IO/framework/serialization/time, define a port and implement it in `infrastructure/`. "I need a place for this helper" is a smell — find its real home.
- Don't return raw API DTOs to components. Map to an entity or a view model in `infrastructure/data/`.
- Don't add a DI container library. The composition root + Context is enough.
- Don't `new` a use case, repository or SDK wrapper outside the composition root (tests excepted). Pages and endpoints get the interface.
- Don't let the framework's style shape use cases, ports or entities (e.g. use cases as hooks or bare functions). Interface + class, constructor injection.

## Avoid duplicated business rules

Write each business rule once, in a rules module (`entities/` or `application/`, e.g. `bodyRecordRules.dateProblem`). Use cases and validators call it; never copy it. A client may repeat the check only to warn before sending, using the same test cases. Before writing an `if` for a rule, search whether it already exists.

## Quality checks (dryer, crapper)

Run both from the project root before finishing a change, in PowerShell (not Bash). `PY` is
`$HOME\.venvs\pnt-tools\Scripts\python -X utf8` (`-X utf8` is needed on Windows).

- **Duplication:** `PY -m dryer --changed`. It lists pairs of functions with the same
  structure (names and values ignored), closest first. Merge when both are the same rule and
  would change together. Many pairs can be one function copied into several files.
- **CRAP:** first run the tests with LCOV coverage (Jest:
  `npx jest --coverage --coverageReporters=lcov`), then
  `PY -m crapper --use-existing-coverage --changed`. CRAP = complexity² × (1 − coverage)³ +
  complexity. Bring each changed function under 10: split it, test it, or both. Without
  coverage the score is meaningless; don't use `--no-coverage` to judge.
- If either one flags a problem in the code you changed, refactor before finishing (merge the
  duplicate; split or test the function), then run both again.
- If the tools are not installed, offer to install them (commands in `/rdp:setup-repo`, step 5).
