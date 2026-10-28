# RDP AI standards

<!-- Copied into each project by /rdp:setup-repo as .claude/rdp-standards.md and
     refreshed by the RDP commands. Don't edit the copy: change it in
     rdp-claude-marketplace (plugins/rdp/templates/rdp-standards.md). -->

Shared rules for every RDP project. When this file and the project's `CLAUDE.md` or `docs/architecture/` conflict, the project wins.

## On-demand rules

Topic rules are skills in the `rdp` plugin. Before starting a task listed below, load the matching skill and follow it. Load only the rows that match the task and the project's stack. Which skills apply to this project (e.g. clean architecture) is in the RDP block of the project's `CLAUDE.md`.

| Task | .NET | TypeScript / React (Native) |
|---|---|---|
| Writing, reviewing or fixing code | `clean-architecture` | `clean-architecture-typescript` |
| Adding or changing tests | `testing` | `testing-typescript` |
| Adding or changing configuration keys / environments | `configuration` | `configuration` (BFF) |
| Adding a SignalR hub or touching hub code | `signalr` | — |
| Touching sign-in, tokens, cookies, identity provider calls or a BFF | `bff` | `bff` |
| Running `ci/verify.sh`, reading a Sonar quality gate or issues, or touching Sonar config | `sonar` | `sonar` |
| Touching CI/CD YAML, `ci/` scripts, deploys, or pipeline secrets | `pipelines` | `pipelines` |
| Committing, branching, or opening a PR | `git-flow` | `git-flow` |
| Reading or writing GitHub issues or docs/ pages | `github-issues` | `github-issues` |
| Talking about or changing business logic, a use case, a feature or a product decision | `product-manager` | `product-manager` |

## Code style

- Functions do one thing where it's natural. Don't extract one-call helpers just to shorten code.
- When a function gets big or clearly does multiple things, extract — even when it's awkward. Size is a forcing function, not a target.
- Stepdown order: if `A` calls `B`, define `B` below `A`. The file reads top to bottom like a newspaper.
- Files hold one cohesive thing — one class, one feature, or a set of closely related helpers. Split when it does unrelated jobs. Past ~1500 lines, look hard for what to extract.
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Extract shared logic when the duplicated code represents the same concept, not just the same characters. If the two places would always change together, extract. If they might evolve apart, leave them duplicated.
- Prefer early returns / guard clauses over nested ifs. Watch for deep nesting — if a block reads gnarly, restructure (split the function, invert the condition, extract the inner loop).
- Ship the smallest edit that solves the problem.
- Take complexity out before you add anything.
- If the code is already clear and local, leave it.

## Working method

Build a change in this order:

1. **Understand** the requirements: business rules, edge cases, invariants, failure conditions.
2. **Design** before coding: the main components, interfaces, data structures and who is responsible for what.
3. **Implement** in sensible increments. A test-first cycle for every small change is not required.
4. **Run the automated tests**: unit, integration and end-to-end where they fit.
5. **Check the tests' quality**: expected values that don't come from the code under test, boundaries
   covered, and a defect introduced on purpose makes them fail.
6. **Review**: maintainability, error handling, security, and whether it really meets the requirements.

- When the environment fails (a package feed returns 403, a tool or an access is missing), stop and
  ask. Don't work around it with a new config file or another source.
- Fix root causes: reproduce the problem, then fix the cause. A guard that only hides the error is not a fix.
- If two fixes built on the same premise fail, stop. Write the premise in one sentence and question it before trying again.
- Refactoring: pin the behavior with tests, change the structure, prove the behavior did not change.
- Work in small units: finish and check one before starting the next.
- Don't bolt a new requirement onto the old design. Think what you would have built if it had been there from the start, then deliver that in pieces.
- If a change repeats across many places, build a tool (a script) for it: do one place by hand, make the tool match it, then run it on the rest.
- Keep the main context small: one task per agent; send bulk work to subagents and keep only their summaries.

## Exceptions

- Don't catch an exception unless you're adding value: recover, transform, enrich, or swallow with a documented reason. Empty catches and bare rethrows (`catch { throw; }`) add nothing.
- When reviewing the app's startup code (composition root), check that a global exception handler is registered. If it's missing, flag it there — not on unrelated tasks.
- If you catch and don't rethrow, log the full exception (message + stack trace). Otherwise the error disappears silently.

## Comments

- Keep your own comments if relevant to understanding later. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on non-trivial public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Dependencies

- Prefer constructor / parameter injection over static state or globals.
- Wrap third-party libs behind a thin interface owned by this project.

## Formatting

- Use the language formatter (`dotnet format`, `prettier`). Don't discuss style beyond that. Whether CI enforces lint depends on the stack — see the `pipelines` skill → *Lint*.

## Logging

- Library: Serilog behind `ILogger<T>` in C# back ends (`clean-architecture` skill), pino in TypeScript (`bff` skill).
- Use structured logging (key-value pairs, not string concatenation).
- Don't log secrets, tokens, or PII.
- Pick a log level deliberately: `Info` for business events, `Warning` for degraded/recoverable state, `Error` for failures requiring attention.

## Security

- If you spot a secret in code or config — API key, connection string, token, password — stop. Warn the user, suggest moving it to environment variables / secret store / pipeline variables, and do not commit the file containing it unless the user explicitly authorizes it.

## Work log

- Keep a log of every action and why in `.claude/tmp/log-<task>.md`. Report it when the task ends, then delete it.

## RDP commands

Issue work uses the commands: `/rdp:story` (creates the story issue with its three-item checklist), then `/rdp:implement <#n> [<#n> ...]` (several stories at once run in parallel, one branch and PR each); `/rdp:help` lists them. If asked for that work outside one, suggest the matching command first. Questions, exploration and editing the standards need none.

## GitHub issues and docs

GitHub issues are the single source of truth for plans and work status; never keep plans or progress in local files. For any GitHub issue or docs/ work, load the `github-issues` skill.
