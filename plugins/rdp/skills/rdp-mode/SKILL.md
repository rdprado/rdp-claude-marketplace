---
name: rdp-mode
description: "RDP main rules for every code change: make it work, make it right, practice; clean architecture layers, errors, logging, and the orders example. Use when writing, reviewing or fixing code. Not for legacy projects (CLAUDE.md says Legacy: YES): those use rdp-mode-legacy."
---

# rdp-mode

Every time you are asked to make a change, go through the parts below in order:
1. First Make it Work.
2. Then Make it Right.
3. Practice: applies the whole time.

Before the first change, create `.claude/tmp/log-<task>.md` (see Keep a Log). When you finish
part 1 and when you finish part 2, write it in the log, so I can see each one was done.

## Other skills

If the project's `CLAUDE.md` says otherwise, the project wins. Before a task, load the matching skills below; skip the ones already loaded in this conversation.

| Task                                                   | .NET              | TypeScript / React (Native)     |
| ------------------------------------------------------ | ----------------- | ------------------------------- |
| `appsettings*.json` keys or environments               | `configuration`   | `configuration`                 |
| SignalR hubs                                           | `signalr`         | —                               |
| Sign-in, tokens, cookies, identity provider calls, BFF | `bff`             | `bff`                           |
| Sonar: running it, its setup, its result               | `sonar`           | —                               |
| CI/CD YAML, `ci/` scripts, deploys, pipeline secrets   | `pipelines`       | `pipelines`                     |
| Commits, branches, PRs                                 | `git-flow`        | `git-flow`                      |
| Pushing a branch, documenting a project in docs/       | `update-docs`     | `update-docs`                   |
| GitHub issues, docs/ pages                             | `github-issues`   | `github-issues`                 |
| Business logic, a use case, a feature, a product decision | `product-manager` | `product-manager`            |

# First Make it Work

## Laziness Protocol

* One decision lives in one place.
* Ship the smallest edit that solves the problem.
* Don't extract one-call helpers just to shorten code.
* No mapping, validation or mediator libraries: mapping is one line, validation a function returning `ValidationResult`.

## Foundational Thinking

* Understand the requirements first: business rules, edge cases, invariants, failure conditions.
* Get the data shape right before you write the logic.
* Design before coding: the main components, interfaces and who is responsible for what.
* Do first whatever helps every later phase.
* If a concurrent writer would matter, do not share state.

## TDD

* Write the failing test before you change the code.
* See it fail for the reason you expect.
* Make the smallest change that makes it pass.
* If an honest test is impractical, do not write a bad one.
* If you didn't do TDD, add quality tests after: expected values not taken from the code, boundaries covered, and they fail on a planted defect.
* Don't assert on log strings.

## Redesign From First Principles

* Do not bolt a new requirement onto the old design.
* Ask what you would have built if it had been there from the start, think that through, and deliver it in pieces.

## Attack the Premise

* When two fixes that share one premise fail the same gate, write that premise in one sentence and count which actors hold the imbalance.
* Remove the assignment.
* Do not start another fix until you have done that.

## Subtract Before You Add

* Take complexity out before you add anything.
* Prefer early returns over nested ifs; avoid deep nesting.

## Outcome-Oriented Execution

* Before starting, define a done you can check: a test, a build, a run.
* Break things midway only if planned and reversible.

## Build the Lever

* If the work is not obvious at a glance, build the tool that does it.
* Do one unit by hand, then make the tool match that unit.

## Architecture

### Clean Architecture Layers

* Inner to outer: Entities → Application → Infrastructure → Entry. Dependencies point inward.
* Entities: business rules and invariants. No framework, no persistence or validation annotations (mapping lives in Infrastructure).
* Application: use cases, their Input/Output, the interfaces they need, validators. Depends only on Entities, and on utilities.
* Utilities (clock, new ids) need no dependency inversion: one place gives the interface and its implementation, and Application injects the interface. The built-in one when the platform has it (`TimeProvider` in .NET), else one small Infrastructure project (`Infrastructure.Ids`: `IIdGenerator` + `GuidIdGenerator`). Never `Guid.NewGuid()` or `DateTime.Now` in the code.
* Infrastructure: implements Application's interfaces. One project or module per concern (`Infrastructure/OrdersRepository`, `Infrastructure/EmailSender`), so consumers reference only what they need. One repository per aggregate root; no Unit of Work, no generic repository. Local dev with no real database: an in-memory database, the same as the integration tests.
* Entry / Presentation: the outer layer that runs the app (controllers, forms, ViewModels, routes, console commands). Maps input to a use case, calls it, renders the output. No business logic. Depends on Application, and on Infrastructure only at the composition root.
* Interfaces name what they provide (`OrderRepository`); implementations put the technology first (`EFOrderRepository`).
* Anything a test can't control (DB, HTTP, filesystem, date/time, randomness, threads, SDK) sits behind an interface, injected via the constructor, so the test can swap it.
* Use cases, validators and business rules are unit-testable without a framework; boundary implementations get integration tests.
* One feature = one use case folder.
* A use case is an interface plus a class with constructor injection, in every language that has them. Framework style (hooks, bare functions) stays in Entry.
* A browser front is thin: no entities or use cases, rules come ready from the API. A thicker client (WPF, desktop or mobile app) may have its own entities and use cases, with the same layers and rules.
* Old code moves to this shape when you touch it, not all at once; agree with the developer first.
* Expected failures (validation, not found, conflict) return a result with a status; exceptions only for the unexpected. The result and `ValidationResult` types are identical in every project.
* A use case's Output never carries entities: Entry maps it to its response.
* Errors cross the wire as stable codes (`goal-not-found`), never messages or stacks; the client translates them. One shape on every endpoint: `{ "error": { "code", "fields" } }`, `fields` only on validation; status 400 validation, 404 not found, 409 conflict, 500 unexpected. Codes are constants in one file. Cover the errors the framework writes on its own too (bad JSON, 401, 404/405/415).

### The Orders Example

This plugin ships reference code in `templates/examples/orders/` (two folders up from this
skill's directory): `api/` is .NET (entities, use cases, repository, controller, logging, tests),
`web/` is Svelte + SvelteKit BFF (screen, ViewModel, gateway, BFF routes, tests). Its comments
hold rules written nowhere else, so treat the code as part of these rules.

* Empty project: run `node <plugin>/scripts/copy-example.mjs <api|web> <AppName>` from the project
  root (`<plugin>` is two folders up from this skill's directory). It copies the stack's example folder
  renamed, with the rule comments. Commit the copy as it is (no architect review: it is the reviewed
  example), so later diffs show only your work. Then cut what the task doesn't need.
  Never copy it by hand or over existing files (the script refuses; don't work around it). The HML
  and PRD config files come with `TODO` values the BFF refuses to start with: ask the developer for them.
* After that, the project's own code is the reference, not the example.
* Read a file only when you are about to use it.
* Copy the shape and the rules, not the names: Orders and its fields are placeholders.

### Model the Domain

* Put the domain in a structure that makes the illegal states impossible.
* Maintain a glossary of domain terms.
* The back end computes business rules (priorities, thresholds, grouping) and sends them ready; sorting and display are the client's. A client repeats a check only to warn before sending. Before writing an `if` for a rule, search whether it exists.
* If the code is already clear and local, leave it.

### Boundary Discipline

* Check the data where it enters: type and shape only. Don't add limits or business rules there; if the system behind it validates, pass it through.
* Inside, trust it.
* Keep the business logic in a pure function.
* Prefer constructor / parameter injection over static state or globals.
* Wrap third-party libs behind a thin interface owned by this project.
* Never edit installed packages (node_modules).

### Type System Discipline

* Make the illegal value impossible to write.
* Parse outside data once, where it comes in.
* Do not silence the compiler (`!`, `any`, casts, suppressions).

### Make Operations Idempotent

* Running it twice, or running it after a crash halfway through, ends in the same state.

### Separate Before Serializing Shared State

* If they do not need the same mutable thing, give each its own.
* If they do, allow one writer, and enforce that in the structure.

# Then Make it Right

## Fix Root Causes

* Reproduce it.
* Fix the cause.
* A guard that only hides the crash is not a fix.

## Sequence work into verifiable units

* Finish one small unit and check it.
* Then start the next.

## Tests

* Ask developer to review your tests. Fake only boundaries, never the unit under test.
* `// Arrange // Act // Assert` in every test. Make the SUT clear.
* No skipped "broken" tests, never catch an error to go green.
* Test levels (Ham Vocke, *The Practical Test Pyramid*). Put each test at the lowest level that can catch the problem:
  1. **Unit**: one class, everything else mocked. Fast (no sleeps, fake timers), no real I/O. Value variations go here; mutation and CRAP run on these. A class that touches UI, database, HTTP or files gets no unit test (test the logic around it).
  2. **Narrow integration**: the one class that talks to an outside system, against a fake of it (the repository against SQLite in-memory). No host, no login.
  3. **Broad integration**: the whole app in-process, called the way a client calls it, with a test login and every outside system faked. Main flows only.
  4. **Contract**: only when another team's app calls this one.
  5. **End-to-end**: the deployed HML, after the deploy, never on a PR. PRD: a read-only smoke check at most.
  * **Subcutaneous** (only with a UI): the ViewModel with the backend faked.
* Integration tests (2 and 3): never a real outside system or the local `appsettings.json`; Docker if needed; parallel, no shared state. When a fake differs from the real system, fix the fake.
* If TypeScript: Vitest (Svelte) or Jest (React Native), `it.each`; `describe` = the unit, `it` = the scenario; fake clock and timers; no faker; fakes implement the port (no `any`, no casts). ViewModels are the main target: `new` with fake ports, check `vm.state`, `dispose()` stops what it started; views have no test.
* If C#: xUnit + Moq + `Assert.*`, `FakeTimeProvider`; no FluentAssertions, Shouldly, NSubstitute, Bogus or AutoFixture. `Tests.Unit`, `Tests.Integration/Narrow` and `/Broad` (the shared test host and fakes in `Infrastructure/`); `WebApplicationFactory`, SQLite in-memory (not EF InMemory) reset per test; `Method_Scenario_Expected`, `[Theory]`.
* For reference, see the orders example's tests.

## Code style

* Files: one class, one feature, or closely related helpers. Split at unrelated jobs or ~1500 lines.
* Functions: one job each; extract when big. If `A` calls `B`, define `B` below `A`.
* Names: specific, <5 grep hits. Avoid `data`, `handler`, `Manager`, `Common`.
* No `Common`, `Shared`, `Utils` or `Helpers` folders or projects: a helper goes where it belongs (a business rule on the entity, I/O behind an interface).
* Extract duplication only when it is the same concept. If the two places would always change together, extract. If they might evolve apart, leave them duplicated.

## Exceptions

* Catch only to recover, transform, enrich, or swallow with a reason. No empty catches or bare rethrows.
* If you swallow it, log the full exception (message + stack trace).
* When reviewing startup code, check a global exception handler is registered.
* Unexpected exceptions are logged once, by the global exception handler; don't log and rethrow on the way.

## Logging

* Serilog behind `ILogger<T>` in C#, pino in TypeScript.
* Log files live outside the app folder, so a deploy doesn't wipe them.
* Structured (key-value, not string concatenation). Never log secrets, tokens, or personal data (email, CPF); the user id is enough.
* Levels: `Info` business events, `Warning` degraded/recoverable, `Error` needs attention.
* Audit every write (`POST/PUT/PATCH/DELETE`): user id, action, route ids, status, body with sensitive fields hidden. A failure to log never fails the request.

## Crapper and Mutator: the goal (TypeScript/JavaScript only; in .NET, Sonar is the check)

You are not done until every function you changed has CRAP under 10 and no mutant survives in the
files you changed. Getting there means many tests and close to 100% line and branch coverage.
Write in `.claude/tmp/log-<task>.md` the final numbers of both.

## Crapper (TypeScript/JavaScript only)

* Run from the project root in PowerShell; `PY` is `$HOME\.venvs\pnt-tools\Scripts\python -X utf8`.
* First the tests with LCOV coverage (`npx vitest run --coverage --coverage.reporter=lcov`, or Jest
  `--coverage --coverageReporters=lcov`), then `PY -m crapper --use-existing-coverage --changed`.
  Never judge with `--no-coverage`.
* Reduce each function under CRAP 10 by splitting it, by testing it, or both.
* Consider whether case statements are worth reducing.
* Write in `.claude/tmp/log-<task>.md` when you ran it and what it found.

## Mutator (TypeScript/JavaScript only)

* After Crapper, with the same LCOV: `PY -m mutator --changed --use-existing-coverage --test-command "<a
  one-process test command for only the changed files' tests>"`, e.g. `npx vitest run --no-file-parallelism
  --maxWorkers=1 src/lib/orders` (Jest: `--runInBand <paths>`). Pass `--test-command` always: on Windows
  mutator can't start `npm` on its own. Exit 0: every mutant killed; 3: a mutant survived; 2: the tests fail before mutating.
* Mutator can freeze the PC. To prevent it: one run at a time, never from parallel agents;
  `--max-workers 3` (each worker runs the test command); that command runs only the tests of the files
  being mutated, in one process (never the full suite with its default pool); only `--changed` files.
* Cover the uncovered.
* Kill each survivor with a test. One you think can't be killed: show in the log why both versions
  behave the same, and ask. That is rare; usually a test is missing.
* Write in `.claude/tmp/log-<task>.md` when you ran it and what it found.

## Dryer (TypeScript/JavaScript only; in .NET, Sonar is the check)

* `PY -m dryer` on the whole project, then look only at pairs where one side is a file you
  changed. Merge pairs ranked 0.8 or above when they are the same rule and would change together.
* Write in `.claude/tmp/log-<task>.md` when you ran it and what it found.

## Sonar (.NET only)

* Run it as the `sonar` skill says, unless the project's `CLAUDE.md` says `Sonar: none`. If something is
  missing, the skill says how to get it ready.
* Fix every issue new from this work; leave the pre-existing debt to the developer.

## Refactoring

* Pin what the code does.
* Change the structure.
* Prove the behavior did not change.

## Review

* Run the automated tests: unit, integration and end-to-end where they fit.
* Review maintainability, error handling, security, and whether it really meets the requirements.

# Practice

## Keep a Log

* Keep a log of every action you take and the reason you took it, in `.claude/tmp/log-<task>.md`.
* When you start and finish each part, run `date` and write its time in the log.
* Ask before deciding what the request didn't settle: a rule, a limit, a validation, a behavior.
  Write the developer's answer in the log. Also write anything you built that wasn't asked.
* End with what is left open.
* Report that log upon completion and keep it (`.claude/tmp/` is git-ignored).
* Dont skip this!

## Guard the Context Window

* Keep the main thread small.
* Send the bulk elsewhere, and keep the summary.
* One task per agent.

## Worktree Cleanup

* Find what is safe to remove, confirm nothing still in use needs it, then reclaim the disk.
* Uncommitted work waits for a decision.

## Commit and Push

* Unless you are the architect: before each commit, run the `rdp:architect` agent (RDP's review
  agent) on the diff. Give it what was asked and the changed files. Write in
  `.claude/tmp/log-<task>.md` what it found and what you fixed, or why not. Fix its bugs and
  guideline violations; anything that adds a rule, a limit or a behavior goes to the developer first.
* Commit often, in small ordered commits.
* Each commit says why, what changed, and how you proved it.

## RDP

* New story: suggest `/rdp:story`; `/rdp:help` lists the commands.
* GitHub issues are the source of truth for plans and status; never keep them in local files. Load `github-issues` for GitHub issue or docs/ work.
