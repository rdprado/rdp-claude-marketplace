# <project-name>

<!-- Template for a legacy project's CLAUDE.md, copied to the project root as
     CLAUDE.md by /rdp:setup-repo. Keep this file to project specifics only, and
     never put absolute paths in it. When running /init, keep the PnT block and
     the "Project profile" block, and fill in the skeleton below them.
     Required: "Project profile" (the PnT commands read it). Every other section
     is optional: delete what doesn't apply (e.g. Sonar or Git flow in a project
     with no git/CI) or write "N/A" in its line. -->

<!-- PnT block — written by /rdp:setup-repo, refreshed by the PnT commands. -->
@.claude/pnt-standards.md

Rules that apply: all PnT skills except clean architecture. Tests are not required; any test you add follows the `testing` skill.
<!-- end PnT block -->

## Project profile

- Stack: <legacy runtime, e.g. .NET Framework 4.7.2 + WinForms>
- Uses clean architecture: NO
- Legacy: YES — no enforced layering, legacy framework, little test coverage.
- Git flow: <A (release branches) / B (GitHub Flow)> — see the `git-flow` skill.
- GitHub repo: `<owner/repo>` — tag `[<Project>]` (every issue title starts with it); labels and milestones are read from GitHub.
- Docs: <path to this project's intro in docs/>

For new code, follow "Guidelines for new code" below.

## Sonar

Generic rules and how to read results: the `sonar` skill. Values here must match `ci/verify.sh` and the pipeline.

- Official project key: `<sonar-project-key>` (CI analyzes this; local runs use `<key>-local-<dev>` automatically — see the `sonar` skill)
- Base branch for the local issue classification: `<main | release/X.Y.x>` (`BASE_BRANCH` in `ci/verify.sh`)
- Coverage report: `<path/glob, e.g. **/coverage.opencover.xml>` (`<opencover | lcov>`) — same as the pipeline.
- Scanner working dir (gitignored): `<.sonarqube/ | .scannerwork/>`
- Current pass bar (<date checked>): `<e.g. new_violations must be 0>`
- Known pre-existing debt (reported, not blocking unless we're paying it down): `<e.g. new_coverage 41.2% vs 80% required; new_duplicated_lines_density 6.1% vs 3%>`
- Pipeline gate requires: `<the full gate conditions, for comparison>`

## The pattern for huge legacy projects

For codebases too large to navigate from a single CLAUDE.md (tens of thousands of LOC, files of thousands of lines, no enforced layering), use a **hierarchical CLAUDE.md structure**:

1. This project-root CLAUDE.md gives high-level orientation: stack, layout, scarce-context rules, navigation map.
2. Each major subsystem folder has its own CLAUDE.md describing what lives there, the biggest files (with LOC), the cleanest seams, what to grep for first.
3. The map at the bottom of this file links them all.

Claude reads this file upfront, then opens the relevant subsystem doc only when navigating into that area — saving context.

The sections below are the **skeleton produced by `/init`** for a legacy project. Fill in `<placeholders>` with your codebase's specifics.

## What this is

`<project-name>` is a `<short description: what it does, in domain language>`. `<runtime constraints, e.g. long-running, stateful, must not be restarted during business hours>`.

It is **not** `<sibling system 1>`, **not** `<sibling system 2>` — disambiguate from neighbors so Claude doesn't conflate them.

## Tech stack — hard constraints

- Targets **`<legacy runtime, e.g. .NET Framework 4.7.2>`**. Intentional. Do not introduce **`<modern alternative>`** APIs, packages, or patterns.
- **`<Legacy UI/framework, e.g. WinForms>`** layer. Legacy, not a design choice. Do not "modernize."
- Runs as **`<deployment target, e.g. Windows service>`**. Platform target is **`<arch>`**.
- Build with **`<toolchain, e.g. MSBuild, not dotnet build>`**:

  ```
  <actual build command>
  ```

## Solution layout

- `<solution>.sln` — primary solution.
- `<src/MainProject>/` — main project. Subfolders by concern: `<Concern1>/`, `<Concern2>/`, …
- `<src/SharedLib>/` — shared types.
- `<tests/UnitTests>/` — the only test project with meaningful coverage (if any).

There is **`<no / limited>`** meaningful unit-test coverage across the bulk of the codebase. Assume any class outside `<tests/UnitTests>/` is untested.

## Working with this codebase — critical guidance

The codebase is large, old, and entangled. Files routinely run thousands of lines, classes mix many responsibilities, there is no enforced layering, almost any class can reference any other. Treat context as scarce:

- **Do not read whole files speculatively.** Use Grep to locate the symbol, then Read with `offset`/`limit` around the hit.
- **Do not assume a class has a single purpose** — it almost certainly doesn't.
- **Trace flows incrementally.** When a method calls into another class, decide whether you actually need to open it before doing so. Don't auto-expand the reference graph.
- Prefer narrow, targeted questions over broad sweeps.

## Guidelines for new code

- **SRP for new logic.** Put new code in its own focused class. When a change touches a bloated class, prefer **extracting** the new piece over growing the class further.
- **Leave testable seams.** Structure new business logic so it could be unit-tested later, even though most surrounding code can't be. When a natural seam exists, leave a brief comment marking it.
- **Inject the clock** instead of calling `DateTime.Now` — the clock may be virtualized in tests. Use `TimeProvider` (via the `Microsoft.Bcl.TimeProvider` package on .NET Framework) if the project allows adding it; otherwise a project-owned `IClock`.

## Subtree CLAUDE.md map

In the absence of clean architecture, **the navigation aid is the architecture.** Each major folder gets its own `CLAUDE.md`. Read the closest one when working in a subtree — they exist so you don't have to open the giant files to orient yourself.

- [`<src/MainProject>/CLAUDE.md`](<src/MainProject>/CLAUDE.md) — main project: central service-locator, startup flow, folder map.
  - [`<Concern1>/CLAUDE.md`](<src/MainProject>/<Concern1>/CLAUDE.md) — one-line description.
  - [`<Concern2>/CLAUDE.md`](<src/MainProject>/<Concern2>/CLAUDE.md) — one-line description.

When a subtree doesn't have a `CLAUDE.md`, **create one** as part of the first non-trivial task there. Capture: what the folder does, the 3–5 biggest files with LOC, the cleanest seams, what to grep for first.
