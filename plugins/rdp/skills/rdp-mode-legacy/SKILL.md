---
name: rdp-mode-legacy
description: "ONLY for old .NET Framework legacy projects whose CLAUDE.md says Legacy: YES. RDP rules for code changes there: code style, exceptions, comments, testability, logging, security, tests you add. Every other project uses rdp-mode, never this."
---

# rdp-mode-legacy

**Only for old .NET Framework legacy projects: the project's `CLAUDE.md` says `Legacy: YES`. If it
doesn't, stop and load `rdp-mode` instead.**

The rules for legacy projects: no clean architecture, tests not required, no Sonar. The project's
`CLAUDE.md` ("Guidelines for new code", subtree `CLAUDE.md` files) wins over this skill.

## Other skills

Before a task, load the matching skills below; skip the ones already loaded in this conversation.

| Task                                                    | Skill             |
| ------------------------------------------------------- | ----------------- |
| `appsettings*.json` / `app.config` keys or environments | `configuration`   |
| SignalR hubs                                            | `signalr`         |
| CI/CD YAML, `ci/` scripts, deploys, pipeline secrets    | `pipelines`       |
| Commits, branches, PRs                                  | `git-flow`        |
| Pushing a branch, documenting a project in docs/        | `update-docs`     |
| GitHub issues, docs/ pages                              | `github-issues`   |

## Before you change code

* Ship the smallest edit that solves the problem.
* Fix the cause. A guard that only hides the crash is not a fix.
* Before starting, define a done you can check: a build, a run, a test.

## Code style

* Functions do one thing where it's natural. Don't extract one-call helpers just to shorten code.
* When a function gets big or clearly does several things, extract, even when it's awkward.
* If `A` calls `B`, define `B` below `A`: the file reads top to bottom.
* Files hold one cohesive thing. Split when it does unrelated jobs; past ~1500 lines, look hard for
  what to extract.
* Names: specific, <5 grep hits. Avoid `data`, `handler`, `Manager`.
* Extract duplication only when it is the same concept: if the two places would always change
  together, extract; if they might evolve apart, leave them.
* Prefer early returns over nested ifs; avoid deep nesting.

## Exceptions

* Catch only to recover, transform, enrich, or swallow with a documented reason. No empty catches or
  bare rethrows.
* If you catch and don't rethrow, log the full exception (message + stack trace).
* When reviewing startup code, check a global exception handler is registered; flag it there only.

## Comments

* Keep your comments that help later; don't strip them on refactor.
* Write why, not what.
* Non-trivial public functions: intent + one usage example.
* Reference the issue key or commit when a line exists because of a specific bug or constraint.

## Testability and dependencies

* New code is unit-testable: anything that crosses a boundary (DB, HTTP, filesystem, clock,
  third-party SDK, framework API) sits behind an interface, injected via the constructor.
* Boundary implementations don't need unit tests; integration tests cover them.
* Prefer constructor / parameter injection over static state or globals.
* Wrap third-party libs behind a thin interface owned by this project.
* Never edit installed packages; bump the version or wrap it instead.

## Formatting

* Use the language formatter (`dotnet format`, `prettier`). Don't discuss style beyond that.

## Logging

* Structured (key-value pairs, not string concatenation).
* Never log secrets, tokens, or personal data (email, CPF).
* Levels: `Info` business events, `Warning` degraded/recoverable, `Error` needs attention.

## Security

* A secret in code or config (API key, connection string, token, password): stop, warn the developer,
  suggest moving it to environment variables, a secret store or pipeline variables, and don't commit
  the file unless the developer says so.

## Tests (only the ones you add)

* `// Arrange // Act // Assert`. Fake only boundaries, never the unit under test.
* xUnit + Moq + `Assert.*`, `FakeTimeProvider`; `Method_Scenario_Expected`, `[Theory]`.
* Fast: no sleeps, no real I/O. No skipped tests, never catch an error to go green.
