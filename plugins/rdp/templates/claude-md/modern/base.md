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
Before writing, reviewing, testing or designing code, load the `rdp-mode` skill and the RDP skills its table lists for the task. Clean architecture applies. Tests are required.
<!-- end RDP block -->

## Project profile

- Stack: <.NET 8 / TypeScript + React Native / …>
- Template: <ASP.NET Core back end / Svelte + BFF / Svelte + BFF + ASP.NET Core back end / N/A>
- Uses clean architecture: YES
- Legacy: NO
- Git flow: B (GitHub Flow) — see the `git-flow` skill. Switch to A only if the project ships parallel versioned releases.
- GitHub repo: `<owner/repo>` — tag `[<Project>]` (every issue title starts with it); labels and milestones are read from GitHub.
- Docs: <path to this project's intro in docs/>

## Sonar (.NET)

How to run it and set it up: the `sonar` skill.

- Official project key: `<sonar-project-key | none (an experiment that will never ship)>`
- Base branch for "new from this work": `<main | release/X.Y.x>`

## Build and test

```
<build command>
<unit test command>
```

<!-- /init: stack details, solution layout, conventions and navigation go below. -->
