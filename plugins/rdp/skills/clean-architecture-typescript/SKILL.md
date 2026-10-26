---
name: clean-architecture-typescript
description: "RDP rules for TypeScript / JavaScript — React, React Native, Svelte / SvelteKit and the BFF: language, clean architecture, use cases, quality checks. Use when writing, reviewing or fixing TS, TSX, JS or .svelte code."
---
# Clean Architecture — TypeScript / React (Native)

How we structure React, React Native and Svelte projects in TypeScript. This is the TS counterpart of the `clean-architecture` skill (.NET) — same layering and dependency rules, idiomatic TS shapes.

> **The framework never dictates a pattern from the use case inward.**
> React, Svelte, Expo, a BFF — they live only in the Interface Adapters ring. From the use case
> on (use cases, ports, entities, infrastructure), the shapes are ours and match the .NET skill:
> an interface plus a class, dependencies through the constructor. A page or endpoint calls the
> use case **through its interface** and never does `new`; the only `new` lives in the
> composition root. Framework fashion (hooks, function-everything) stops at the adapter.
>
> Updated on 26/10/2026 (presentation is MVVM) and recommended by RDP. Some existing projects are
> organized differently (e.g. use cases as plain functions, logic in hooks); new code follows this shape, and old code moves toward it
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

- Components are pure functions of props + state. No logic in components — a screen binds to its ViewModel (see "Presentation: MVVM").
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
4. **Interface Adapters** — the outer ring where **presentation and entry live together**. Presentation is **MVVM** — a View pattern, not a Clean Architecture layer of its own: the View (screens, components) binds to a ViewModel class per screen (see "Presentation: MVVM"). Entry is the way input reaches the app: user clicks / Expo Router or SvelteKit routes on the client, or HTTP endpoints on a backend. No business logic.
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
├── interface-adapters/             # presentation (MVVM) + entry
│   ├── common/                     # ViewModel<S> base class, useViewModel (React)
│   ├── screens/
│   │   └── trainees/
│   │       ├── TraineesViewModel.ts       # state + decisions, plain TS
│   │       ├── TraineesViewModel.test.ts
│   │       └── TraineesScreen.tsx         # the View (TraineesScreen.svelte in Svelte)
│   ├── components/                 # shared Views
│   └── stores/                     # Zustand: only state shared across screens
├── composition/                    # composition root (DI wiring)
└── app/                            # Expo Router entry — route files that re-export from interface-adapters
```

> `app/` sits at the root because Expo Router requires it there, but it belongs to the **Interface Adapters** layer conceptually — it is the entry. Keep the route files thin: they re-export screens from `interface-adapters/screens/`. SvelteKit is the same with `src/routes/`: `+page.svelte` only renders `<TraineesScreen />`.

> Existing projects don't have to move every file at once. The target shape is above; refactor toward it incrementally.

## Interface Adapters: where presentation and entry meet

In Clean Architecture the outermost ring of adapters — presentation, controllers/entry, and the gateways/repositories that talk to the outside world — is a single conceptual layer: **Interface Adapters**. They translate between the shapes the use cases speak (`Input`/`Output`, ports) and the shapes the outside world speaks (React props, HTTP payloads, SDK calls).

How that maps in this codebase:

- **Ports** (the interface each adapter implements) live in `application/ports/`. They are the contract; the adapter is one concrete side of it.
- **UI / entry adapters** live in `interface-adapters/`: screens (View + ViewModel), components, Zustand stores, and the entry points (`app/` or `src/routes/`, click handlers).
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
- `<feature>.validator.ts` — the validator alone, `<Feature>Validator.validate(input)` (colocated, still part of the Application layer).

A use case is an **interface plus a class**, exactly like .NET: the ports it needs come in through
the constructor, and `execute(input)` runs it. Callers depend on the interface only.

```ts
// application/use-cases/listUserCustomColors/listUserCustomColors.ts
import { Result } from '@application/common/Result';
import { UserCustomDefinitionRepository } from '@application/ports/UserCustomDefinitionRepository';
import { ListUserCustomColorsValidator } from './listUserCustomColors.validator';

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
    const validation = ListUserCustomColorsValidator.validate(input);
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
- Validators and rules modules hold no dependencies, so they are not injected. They are a `const`
  object named like the C# `static class`, called as `Name.method()`: the .NET
  `ListUserCustomColorsValidator.Validate` is `ListUserCustomColorsValidator.validate` here.
  - Methods never use `this` (they break when passed as a callback); call each other by name.
  - A helper that shouldn't be public is an unexported function in the same file.
  - "Now" comes in the input (`today`), never from `new Date()`; whoever calls it has the `Clock`.
- In the front, the ViewModel calls the field validator to warn before sending (MVVM); the API
  validates for real. A front use case exists only when there is real orchestration.

```ts
// application/use-cases/listUserCustomColors/listUserCustomColors.validator.ts
import { ValidationResult } from '@application/common/ValidationResult';
import { ListUserCustomColorsInput } from './listUserCustomColors';

export const ListUserCustomColorsValidator = {
  validate(input: ListUserCustomColorsInput): ValidationResult {
    if (!input.userId) {
      return ValidationResult.fail('userId must not be empty.');
    }
    return ValidationResult.success;
  },
};
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

Exceptions are reserved for unexpected failures (network down, SDK 500). In a use case, let them propagate. A ViewModel catches them at the screen (see "Errors → feedback").

```ts
// application/common/Result.ts
export type OutputStatus = 'success' | 'notFound' | 'validation' | 'conflict';

export type FieldErrors = Readonly<Record<string, string>>;

export type Result<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'notFound'; readonly error: string }
  | { readonly status: 'validation'; readonly error: string; readonly fields?: FieldErrors }
  | { readonly status: 'conflict'; readonly error: string };

export const Result = {
  success: <T>(value: T): Result<T> => ({ status: 'success', value }),
  notFound: <T>(error: string): Result<T> => ({ status: 'notFound', error }),
  validation: <T>(error: string, fields?: FieldErrors): Result<T> => ({ status: 'validation', error, fields }),
  conflict: <T>(error: string): Result<T> => ({ status: 'conflict', error }),
};
```

`fields` carries per-field messages when the API sends them (`{ email: 'already taken' }`), so the screen can show each one under its field.

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

> The `Clock` port matters specifically: use cases and ViewModels that need "now" (e.g. the StartTime/EndTime strategy validation) take a `Clock` and pass the time into the validator's input, never call `new Date()` directly — otherwise they are not deterministically testable. See the `testing-typescript` skill → "Time is injected".

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

## Presentation: MVVM

Every screen, in React, React Native and Svelte, has three parts:

- **Model:** where the data comes from — the use case or client interface (`TraineesClient`),
  entities, types.
- **ViewModel:** one plain TS class per screen. It holds the screen state and decides what to show
  (messages, `canSubmit`, sorting, field warnings). No React and no Svelte inside: no hooks, no runes.
- **View:** the `.tsx` / `.svelte` file. Humble: it reads the state and calls ViewModel methods. No
  `if` beyond show/hide, no formatting, no calls to clients.

Rules that keep it testable:

1. Everything outside comes through the constructor as an interface: use case or client, `Clock`,
   navigation, toasts.
2. The state is one immutable snapshot (`vm.state`), replaced with `set()` on each change.
3. Actions return a `Promise` (`load()`, `submit()`), so a test can `await` them.
4. The notification plumbing lives in one base class, `ViewModel<S>`. ViewModels only call `set()`.
5. The View has no logic, so it has no unit tests. The ViewModel does.

The base class serves both frameworks: Svelte's store contract (`subscribe` calls back right away
and returns an unsubscribe) and React's `useSyncExternalStore` (`subscribe` + a stable snapshot —
`state` is the same reference until `set()`).

```ts
// interface-adapters/common/ViewModel.ts
export abstract class ViewModel<S> {
  private readonly listeners = new Set<(state: S) => void>();

  constructor(private current: S) {}

  get state(): S {
    return this.current;
  }

  getSnapshot = (): S => this.current;

  subscribe = (listener: (state: S) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.current); // Svelte's store contract needs the immediate call
    return () => this.listeners.delete(listener);
  };

  protected set(next: S): void {
    this.current = next;
    this.listeners.forEach((listener) => listener(next));
  }
}
```

```ts
// interface-adapters/screens/trainees/TraineesViewModel.ts
export type TraineesState = {
  readonly names: readonly string[];
  readonly error: string | null;
  readonly loading: boolean;
};

export class TraineesViewModel extends ViewModel<TraineesState> {
  constructor(private readonly client: TraineesClient) {
    super({ names: [], error: null, loading: false });
  }

  async load(): Promise<void> {
    this.set({ ...this.state, loading: true, error: null });
    const result = await this.client.list();
    switch (result.status) {
      case 'success':
        this.set({ names: result.value.map((t) => t.name).sort(), error: null, loading: false });
        return;
      case 'validation':
      case 'conflict':
      case 'notFound':
        this.set({ ...this.state, error: result.error, loading: false });
        return;
    }
  }
}
```

The `switch` has no `default` — TypeScript flags it if a new `OutputStatus` is added and not handled here.

Svelte reads it with `$vm`; the route `src/routes/trainees/+page.svelte` only renders `<TraineesScreen />`:

```svelte
<!-- interface-adapters/screens/trainees/TraineesScreen.svelte -->
<script lang="ts">
  import { getContainer } from '@composition/context';
  const vm = getContainer().traineesViewModel();
  vm.load();
</script>

{#if $vm.error}<p role="alert">{$vm.error}</p>{/if}
{#each $vm.names as name}<p>{name}</p>{/each}
```

React reads it with one generic hook:

```tsx
// interface-adapters/common/useViewModel.ts
export function useViewModel<S>(vm: ViewModel<S>): S {
  return useSyncExternalStore(vm.subscribe, vm.getSnapshot);
}

// interface-adapters/screens/trainees/TraineesScreen.tsx
export function TraineesScreen() {
  const { traineesViewModel } = useContainer();
  const [vm] = useState(traineesViewModel); // one instance per mount
  const state = useViewModel(vm);
  useEffect(() => void vm.load(), [vm]);

  return state.error ? <Text role="alert">{state.error}</Text> : <TraineeList names={state.names} />;
}
```

- **Use case or client?** When the business logic is in the API (see `rdp:bff`), the ViewModel
  calls the client interface directly; a front use case would only pass the call through. Add a
  front use case only for real front-side work: several ports in one action, offline, local
  storage, throttling a stream.
- **Zustand** only for state shared across screens (session, selected account). A screen's own
  state lives in its ViewModel.
- Big pure pieces of a ViewModel (a mapping, a sort rule) can move to a plain function next to it.

### Errors → feedback

The View calls a ViewModel method; the ViewModel calls the client; the `Result` comes back to the
ViewModel, which turns it into state; the View re-renders. The View never sees the `Result`.

```
View: onclick={() => vm.submit()}
  → ViewModel: await this.client.save(...)      ← the Result arrives here
  → ViewModel: this.set({ ...state, fieldErrors })
  → View re-renders from $vm / useViewModel
```

**1. The client maps HTTP to `Result`** in a pure function next to it, so the mapping is unit-tested
and only the `fetch` call is left untested:

```ts
// infrastructure/data/trainees/toResult.ts
export function toResult<T>(status: number, body: ApiBody<T>): Result<T> {
  if (status >= 200 && status < 300) return Result.success(body.data as T);
  if (status === 400) return Result.validation(body.message, body.fields);
  if (status === 404) return Result.notFound(body.message);
  if (status === 409) return Result.conflict(body.message);
  throw new UnexpectedResponseError(status); // 5xx and anything else: unexpected
}
```

- **`401`** is the same on every screen, so it is handled once, in the shared HTTP adapter. No
  ViewModel handles it:
  - BFF inside the API (2-tier): the adapter calls the refresh endpoint once and retries the request.
  - Separate BFF: the BFF renews the token itself, so a `401` reaching the front means the session
    is over.
  - Still `401`: the adapter calls the `Session` port (`session.expired()` → back to sign-in) and
    throws `SessionExpiredError`.
- **Network down / `5xx`**: the client throws.

**2. The ViewModel turns each case into state or a port call:**

| Case | ViewModel | The user sees |
|---|---|---|
| `validation` | `fieldErrors: result.fields ?? {}`, `error: result.error` | the message under each field |
| `notFound` / `conflict` | `error: result.error` | a banner |
| thrown (network, `5xx`) | `error: 'errors.unexpected'`, `canRetry: true`, `monitoring.report(e)` | message + "Tentar de novo" |
| thrown `SessionExpiredError` | only `saving: false`; not reported | the sign-in screen (the adapter already sent them) |
| `success` | updates the state, `toaster.show('feedback.saved')` | updated list / toast |

```ts
async submit(): Promise<void> {
  this.set({ ...this.state, saving: true, error: null, fieldErrors: {} });
  try {
    const result = await this.client.save(this.state.form);
    switch (result.status) {
      case 'success':
        this.toaster.show('feedback.saved');
        this.set({ ...this.state, saving: false });
        return;
      case 'validation':
        this.set({ ...this.state, saving: false, error: result.error, fieldErrors: result.fields ?? {} });
        return;
      case 'notFound':
      case 'conflict':
        this.set({ ...this.state, saving: false, error: result.error });
        return;
      default:
        assertNever(result); // a new status breaks the build here
    }
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      this.set({ ...this.state, saving: false });
      return;
    }
    this.monitoring.report(e);
    this.set({ ...this.state, saving: false, error: 'errors.unexpected', canRetry: true });
  }
}
```

```ts
// application/common/assertNever.ts
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
```

- Navigation, toasts and monitoring are ports (`Navigator`, `Toaster`, `Monitoring`) in the
  ViewModel's constructor, so a test checks them with fakes.
- The `catch` is the screen's safety net: without it a failure leaves `saving: true` forever.
- A session expiry is not a bug: never report it to monitoring.
- The ViewModel's own text is an i18n key (`'errors.unexpected'`); the View translates it. Messages
  from the API (`result.error`, `fields`) come in the user's language already.
- Every `switch` on a status ends with `default: assertNever(x)`. Without it, a method that returns
  `void` compiles even when a new status is not handled.

## BFF (backend for frontend)

Who holds identity and the token (BFF inside the API or a separate BFF): load `rdp:bff` with the
Skill tool and follow it.

## Dependency injection

Two links, same as .NET:

- **Use case ← ports:** the repositories and tech (HTTP, storage, clock) come in through the
  use case constructor, typed as port interfaces.
- **ViewModel / endpoint → use case or client:** it gets the **interface** through its
  constructor. It never does `new` and never imports the class.

The only `new` lives in the **composition root**, a plain module written by hand (Pure DI). It is
the TS equivalent of the .NET `AddApplication()/AddInfrastructure()` calls, and it is typed: a
missing dependency fails at compile time.

```ts
// composition/container.ts
export function buildContainer() {
  const strategyRepo = new SignalRStrategyRepository(/* ... */);
  const traineesClient: TraineesClient = new HttpTraineesClient(/* ... */);
  const clock: Clock = new SystemClock();

  return {
    createTwapStrategy: new CreateTwapStrategy(strategyRepo, clock) as CreateTwapStrategyUseCase,
    // ...one entry per use case, typed as its interface
    traineesViewModel: () => new TraineesViewModel(traineesClient),
    // ...one factory per ViewModel: a new instance per screen
  };
}
```

We don't add a DI container library. TS erases types at runtime, so autowiring containers
(tsyringe, InversifyJS) need decorators and metadata that don't work with esbuild/Vite; Pure DI
needs nothing. The framework only **delivers** the container to the adapters: React Context, Svelte
`setContext`/`getContext`, or `event.locals` on a SvelteKit server.

React Context provides the container to the tree; `useContainer()` reads it. In Svelte,
`setContext` in the root layout and a `getContainer()` that calls `getContext`.

```tsx
const ContainerContext = createContext<ReturnType<typeof buildContainer> | null>(null);
export const useContainer = () => {
  const ctx = useContext(ContainerContext);
  if (!ctx) throw new Error('useContainer must be used within ContainerProvider');
  return ctx;
};
```

> Tests never touch the container. They do `new CreateTwapStrategy(fakeRepo, fakeClock)` or `new TraineesViewModel(fakeClient)` — that's the whole point of constructor injection.

## Don't

- Don't import `react`, `expo-*`, `axios`, or `@microsoft/signalr` from `entities/` or `application/`. Define a port; implement it in `infrastructure/`.
- Don't use `any`. Use `unknown` and narrow, or define a real type (see `.claude/rdp-standards.md`).
- Don't put business rules in components, ViewModels, hooks, or Zustand stores. Those belong in use cases and entities (or the API). A ViewModel holds presentation decisions only.
- Don't put logic in a View (`.tsx` / `.svelte`). It binds to its ViewModel.
- Don't use hooks or runes (`$state`, `$derived`) inside a ViewModel. It stays plain TS.
- Don't throw from use cases for expected failures (validation, not-found). Return a `Result`.
- Don't call `new Date()`, `Date.now()`, or `Math.random()` inside entities or application code. Inject a `Clock` / RNG port — otherwise it isn't testable.
- Don't reach into a third-party SDK from more than one place. Wrap it once behind a port.
- Don't create a `utils/` or `common/` dumping ground for misfit code. If a helper reasons about an entity's invariants, put it on the entity. If it touches IO/framework/serialization/time, define a port and implement it in `infrastructure/`. "I need a place for this helper" is a smell — find its real home.
- Don't return raw API DTOs to components. Map to an entity in `infrastructure/data/`; the ViewModel turns it into what the screen shows.
- Don't add a DI container library. The composition root + Context is enough.
- Don't `new` a use case, repository or SDK wrapper outside the composition root (tests excepted). Pages and endpoints get the interface.
- Don't let the framework's style shape use cases, ports or entities (e.g. use cases as hooks or bare functions). Interface + class, constructor injection.

## Avoid duplicated business rules

Write each business rule once, in a rules module (`entities/` or `application/`, e.g. `BodyRecordRules.dateProblem`). Use cases and validators call it; never copy it. A client may repeat the check only to warn before sending, using the same test cases. Before writing an `if` for a rule, search whether it already exists.

## Quality checks (dryer, crapper)

Run both from the project root before finishing a change, in PowerShell (not Bash). `PY` is
`$HOME\.venvs\pnt-tools\Scripts\python -X utf8` (`-X utf8` is needed on Windows).

- **Duplication:** `PY -m dryer --changed`. It lists pairs of functions with the same
  structure (names and values ignored), closest first. Merge when both are the same rule and
  would change together. Many pairs can be one function copied into several files.
- **CRAP:** first run the tests with LCOV coverage yourself (crapper can't start `npm`/`npx` on
  Windows): Jest `npx jest --coverage --coverageReporters=lcov`, Vitest
  `npx vitest run --coverage --coverage.reporter=lcov`, other test script
  `npx c8 --reporter=lcov npm test`. Then `PY -m crapper --use-existing-coverage --changed`. CRAP = complexity² × (1 − coverage)³ +
  complexity. Bring each changed function under 10: split it, test it, or both. Without
  coverage the score is meaningless; don't use `--no-coverage` to judge.
- If either one flags a problem in the code you changed, refactor before finishing (merge the
  duplicate; split or test the function), then run both again.
- If the tools are not installed, offer to install them (commands in `/rdp:setup-repo`, step 5).
