# <project-name>

<!-- Template for a project's CLAUDE.md, copied to the project root as CLAUDE.md
     by /rdp:setup-repo. Keep this file to project specifics only, and never put
     absolute paths in it. When running /init, keep the RDP block and the
     "Project profile" block, and add below them only what is specific to
     this project.
     Required: "Project profile" (the RDP commands read it). Every other section
     is optional: delete what doesn't apply (e.g. Sonar or Git flow in a project
     with no git/CI) or write "N/A" in its line. -->

<!-- RDP block — written by /rdp:setup-repo, refreshed by the RDP commands. -->
@.claude/rdp-standards.md

Rules that apply: all RDP skills, including clean architecture. Tests are required.
<!-- end RDP block -->

## Project profile

- Stack: <.NET 8 / TypeScript + React Native / …>
- Uses clean architecture: YES
- Legacy: NO
- Git flow: <A (release branches) / B (GitHub Flow)> — see the `git-flow` skill.
- GitHub repo: `<owner/repo>` — tag `[<Project>]` (every issue title starts with it); labels and milestones are read from GitHub.
- Docs: <path to this project's intro in docs/>

## Sonar

Generic rules and how to read results: the `sonar` skill. Values here must match `ci/verify.sh` and the pipeline.

- Official project key: `<sonar-project-key>` (CI analyzes this; local runs use `<key>-local-<dev>` automatically — see the `sonar` skill)
- Base branch for the local issue classification: `<main | release/X.Y.x>` (`BASE_BRANCH` in `ci/verify.sh`)
- Coverage report: `<path/glob, e.g. **/coverage.opencover.xml>` (`<opencover | lcov>`) — same as the pipeline.
- Scanner working dir (gitignored): `<.sonarqube/ | .scannerwork/>`
- Current pass bar (<date checked>): `<e.g. new_violations must be 0>`
- Known pre-existing debt (reported, not blocking unless we're paying it down): `<e.g. new_coverage 41.2% vs 80% required; new_duplicated_lines_density 6.1% vs 3%>`
- Pipeline gate requires: `<the full gate conditions, for comparison>`

## Build, test, verify

```
<build command>
<unit test command>
ci/verify.sh        # all gates, same script CI runs
```

<!-- /init: stack details, solution layout, conventions and navigation go below. -->
