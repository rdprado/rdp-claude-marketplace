---
name: pipelines
description: "PnT CI/CD rules: Bitbucket pipelines, ci/ scripts, verify.sh, lint, deploys, NuGet feed and pipeline secrets. Use when touching CI/CD YAML, ci/ scripts, deploys or pipeline secrets."
---
# CI/CD pipelines

How we build, test, and deploy. 

## Platform

- **Bitbucket Pipelines** — `bitbucket-pipelines.yml` at the repo root.
- **Self-hosted Linux runners** — every step uses `runs-on: [self.hosted, linux, deploy, prod]`.
- **Base image**: `mcr.microsoft.com/dotnet/sdk:8.0`.
- Pipelines are code — never edit in the Bitbucket UI. Pipeline changes go through PR review like application code.

## Shape

```
main         : version-gate → [lint] → build+sonar → integration → publish → deploy HML → E2E HML → tag HML → [manual] deploy PRD → E2E PRD → tag PRD
pull request : version-gate → [lint] → build+sonar → integration
manual-build : [lint] → build+sonar → integration

[lint] = only when the project enables it (see *Lint* below).
```

The PR pipeline mirrors the start of `main` so green-on-PR means green-on-merge through unit + integration. Deploys never run from a PR. The `version-gate` step (see [Version gate](#version-gate-delivery-ledger)) runs first on both so a stale version fails fast, before any build cost.

## One verify script: local = pipeline

All quality gates live in **one script, `ci/verify.sh`** (start from `${CLAUDE_PLUGIN_ROOT}/templates/ci/verify.sh`), that developers (and Claude Code) run locally and the pipeline calls. The YAML only calls the script — gate logic never lives inline in `bitbucket-pipelines.yml`. Same rule as `ci/version-gate.sh` (see [Version gate](#version-gate-delivery-ledger)): logic in scripts, YAML just wires them up.

**Run `ci/verify.sh` and get it green before every push and before opening a PR.** CI runs the same gates again.

Gates, in order — the script stops at the first failure and exits non-zero:

1. **lint** — configured per stack (see *Lint* below); off for .NET.
2. **build-sonar** — restore, Sonar begin, build, unit tests with coverage, Sonar end, then the result is read from the Sonar web API and saved to `.sonarqube/report/` (details below and in the `sonar` skill). A **failed quality gate doesn't stop the run**: the remaining gates still run so one verify gives the full picture, and the script exits non-zero at the end. Build or test failures, a Sonar setup problem, or a scanner error still stop immediately.
3. **integration** — integration tests (see below).

Interface:

```
ci/verify.sh                 # all gates, in order (what you run locally)
ci/verify.sh <gate>          # one gate: lint | build-sonar | integration (lint runs even if disabled)
ci/verify.sh --skip-sonar    # local only: skip Sonar for this run
```

### Lint: per stack

- **.NET: off by default** (`LINT_ENABLED=false` in `ci/verify.sh`). The compiler (warnings, analyzers) and Sonar cover code quality; `dotnet format` without a shared `.editorconfig` would only enforce whatever each repo happens to have. Revisit if we adopt a shared `.editorconfig`.
- **TypeScript: on, where the project already has ESLint configured** — `eslint` plus `tsc --noEmit` (type errors fail the gate). A TS project without an ESLint config doesn't get one added as a side effect of verify; that's its own ticket.
- The project's `CLAUDE.md` says which applies. The pipeline runs the lint gate only when the project enables it.

### Sonar analysis parameters: one file, read by CI and local

Project-specific Sonar parameters — coverage report path, exclusions, duplication exclusions, ignored rules (`sonar.issue.ignore.multicriteria`) — live in **`ci/sonar-analysis.properties`**, one `key=value` per line. **`ci/sonar-begin.sh <key>`** is the only place `dotnet sonarscanner begin` is called: it adds host, token and `sonar.qualitygate.wait=true` and passes every line from the properties file as `/d:key=value`. The pipeline's build step runs `bash ci/sonar-begin.sh "$SONAR_PROJECT_KEY"`; `ci/verify.sh` runs it with the local key. So CI, local runs and per-developer local projects apply the same parameters and can't drift. Start from `${CLAUDE_PLUGIN_ROOT}/templates/ci/`. Exclusions and ignored rules specific to one project (e.g. a legacy file accepted as-is) stay in that project's file with a comment saying why — never in these standards.

### Sonar: on by default, skippable only locally

- **Default is to run Sonar.** On an interactive terminal the script asks `Run Sonar analysis? [Y/n]` — Enter means yes. When not interactive (agents, hooks, CI) it never prompts and runs Sonar.
- **Skipping is local-only and explicit:** `--skip-sonar`, or answering `n` at the prompt. The script then prints the marker line `verify: SONAR SKIPPED (local run, developer choice). CI will run it.` and its final line reports `sonar: SKIPPED`.
- **CI always runs Sonar.** With `CI=true` (set by Bitbucket Pipelines) the script refuses `--skip-sonar`, and the pipeline YAML never passes it.
- **Running Sonar without the setup fails — it never falls back to skipping.** Sonar needs `SONAR_HOST_URL` and `SONAR_TOKEN` in the environment, plus Java 17 and `dotnet-sonarscanner`. The project key is not a secret and is committed in `ci/verify.sh`. If something is missing, the gate fails: locally it prints the setup steps (README → "Local Sonar setup"); in CI it names what's missing.
- The quality gate is awaited in both (`sonar.qualitygate.wait=true`), so a failed quality gate fails verify. How to read and report the result (API calls, load-bearing filters, new vs pre-existing issues): the `sonar` skill.
- Claude Code agents never decide to skip Sonar on their own: the developer is asked before each run, and `--skip-sonar` is passed only when the developer explicitly says so.

The pipeline calls one gate per step (`ci/verify.sh lint`, `ci/verify.sh build-sonar`, `ci/verify.sh integration`) so the step split below stays the same. CI-only setup (fresh clone, installing the JRE and the scanner, NuGet feed credentials) stays in the YAML step or a separate `ci/` setup script — not inside the gates — so the gates behave the same on a dev box and a runner. Commit `ci/*.sh` with `eol=lf` (`.gitattributes`).

## Build + unit tests + Sonar (one step)

Sonar earns its place as a guardrail — an independent, deterministic check the AI doesn't optimize against. Wire it in from day one of any new pipeline.

Sonar instruments MSBuild, so `sonarscanner begin → build → test → end` **must run in the same step**.

- Clone fresh into `repo/` using `$BITBUCKET_ACCESS_TOKEN`. Don't reuse the runner's checkout.
- **Full git history.** Never `--depth` on that clone; a pipeline that uses the runner's checkout sets `clone: depth: full` at the top of `bitbucket-pipelines.yml`. Sonar needs the history to tell which lines a PR changed; with Bitbucket's default shallow clone it counts every old issue in a touched file as new code.
- Install runtime deps the SDK image is missing: `openjdk-17-jre-headless` and `libicu-dev` (~30s). The dotnet global tools need them.
- Install `dotnet-sonarscanner` global tool; add `$HOME/.dotnet/tools` to `PATH`.
- Add the private NuGet feed `pntomni`. Credentials via `$NUGET_USER` / `$NUGET_PASS`.
- `dotnet restore` *before* `sonarscanner begin` — restore isn't instrumented.
- Run `bash ci/sonar-begin.sh "$SONAR_PROJECT_KEY"` — it calls `dotnet sonarscanner begin` with `qualitygate.wait=true` (so the pipeline fails on a Sonar gate failure) and the project's `ci/sonar-analysis.properties`. Same script locally. It also sets the analysis version to `$BITBUCKET_BUILD_NUMBER` (`local` on a developer's machine): Sonar's "previous version" new-code period only moves when the version changes, so without it the whole project counts as new code.
- `dotnet build --no-restore --configuration Release`.
- `dotnet test` the unit-tests project with `/p:CollectCoverage=true /p:CoverletOutputFormat=opencover /p:CoverletOutput="$(pwd)/coverage/"`. Coverlet is referenced from the test csproj; it writes `coverage/coverage.opencover.xml`, the path `ci/sonar-analysis.properties` points Sonar at. Fail the step if the file is missing or empty (`test -s`) — otherwise Sonar silently reports 0% coverage.
- `dotnet sonarscanner end` last. Capture its exit code (`set +e ... set -e`) so a gate failure propagates without aborting the wrap-up echo.

### Sonar exclusions

Excluded paths (C#-focused project — these add noise):

- `**/*.cshtml`, `**/*.html`, `**/*.css`, `**/*.scss`, `**/wwwroot/**` — front-end, no business logic.
- `**/*.js`, `**/*.ts`, `**/Scripts/**`, `**/node_modules/**` — not maintained as part of the C# codebase.
- `**/Migrations/**` — auto-generated per EF provider, naturally duplicated.

## Integration tests

Separate step, reuses the build artifact, runs `ci/verify.sh integration`. Integration tests use `WebApplicationFactory` + test doubles for external services + a **SQLite in-memory** database — no EF InMemory provider, no live DB, no Docker. The pipeline needs no database service. If a test needs Docker/Testcontainers for a non-database dependency, it was approved per the `testing` skill first; add the runner support in the same PR.

## Publish

`dotnet publish` the main project to `../artifacts/`. **Delete the base `appsettings.json` from the artifact** — it's the local-dev defaults file and must never ship. Each deploy step picks the right `appsettings.{ENV}.json` and renames it to `appsettings.json` on the target.

## Deploy (HML and PRD)

Same script, different host. SSH-based, against an Ubuntu box running the app as a systemd service. Fill in the `<placeholders>` per project.

1. Load `$SSH_PRIVATE_KEY` (base64), `ssh-keyscan` the target host, verify SSH access.
2. `systemctl stop <SERVICE_NAME>` — **public site is offline until step 6**.
3. Back up the current deploy to `$BACKUP_ROOT/<service-name>_{ENV}_{timestamp}/` (manual rollback target).
4. Wipe `$DEPLOY_PATH`.
5. Pick the right `appsettings.{ENV}.json`, rename to `appsettings.json`, `scp -r` the artifact onto the box.
6. `systemctl start <SERVICE_NAME>`.
7. Poll `http://127.0.0.1:<HEALTH_PORT>/health/live` from the box (up to 60s).
8. Poll `http://127.0.0.1:<HEALTH_PORT>/health/ready` from the box (up to 60s) — confirms DB connectivity.
9. (HML only — when the public URL fronts a load balancer.) Poll a public smoke endpoint of the service (e.g. `/health`, or a protocol-specific discovery endpoint). The LB needs ~10–30s after a restart before it starts routing; retry up to ~2.5 min.
10. Sleep 30s to let LB routing tables settle across nodes before running E2E.

Production app secrets come from the systemd `EnvironmentFile` on the host, not from `appsettings.json`.

## End-to-end tests

Run after deploy against the **deployed environment**, never against a local build.

- **HML E2E**: `E2E_BASE_URL` set to the public HML URL.
- **PRD E2E**: app only listens on `127.0.0.1:<HEALTH_PORT>`. Open an SSH tunnel `localhost:<HEALTH_PORT> → PRD:127.0.0.1:<HEALTH_PORT>`, set `E2E_BASE_URL=http://localhost:<HEALTH_PORT>`, run a read-only subset filtered for production safety.

## Version gate (delivery ledger)

Record every successful delivery as a lightweight git tag `<prefix>-<version>`, where `<version>` is `<Version>` from the main project's `.csproj` and `<prefix>` is the environment (`hml`, `prd-sim`, `prd-app`, …). The tags **are** the ledger — no external state, fully auditable in `git`.

- **Gate first.** `ci/version-gate.sh <prefix>` runs as the first step on both `main` and the PR pipeline. It reads `<Version>` and the highest existing `<prefix>-*` tag, and fails unless `<Version>` is **strictly greater**, compared with `sort -V` (numeric per field, so `1.0.2.0 < 1.0.11.0` — a plain string compare gets this wrong). This blocks re-deploying a version already shipped *and* accidental downgrades; running it on the PR means you find out before merge, not mid-deploy.
- **Tag last.** `ci/version-tag.sh <prefix>` pushes the tag as the final step of a deploy, **after** E2E passes — so the ledger only records fully-validated deliveries. Use a lightweight tag and do **not** add a `tags:` pipeline trigger, or the push starts another run.
- **Keep the logic in scripts**, not inline YAML: `ci/version-gate.sh` / `ci/version-tag.sh`, each taking the prefix as its one argument; the YAML just calls them per environment. Commit them with `eol=lf` (`.gitattributes`) so the Linux runners can execute them.
- **Contributor rule:** every merge to `main` intended to deploy must bump `<Version>` above the last delivered tag, or the gate blocks it. State this in the project's `CLAUDE.md`.
- **Token scope:** the tag push needs `BITBUCKET_ACCESS_TOKEN` to carry `repository:write`. A read-only clone token lets the build succeed but 403s on the push. Bitbucket has no tag-only token scope, so constrain blast radius with a repo-scoped access token plus a branch restriction protecting `main`.
- Avoid zero-padded version fields (`1.0.11.00`): `sort -V` treats them as equal to the unpadded form and the tie-break can let one slip past the gate.

## Environments

- **HML** — `deployment: staging`, auto-deploys on every push to `main`.
- **PRD** — `deployment: production`, `trigger: manual`. A release manager triggers it from the Bitbucket UI after HML E2E passes.

## Secrets

Pipeline variables live in Bitbucket Repository Settings → Repository variables. Standard set per project:

- `BITBUCKET_ACCESS_TOKEN` — for cloning and pushing the delivery tag; needs `repository:write` (see [Version gate](#version-gate-delivery-ledger)).
- `NUGET_USER`, `NUGET_PASS` — private feed credentials.
- `SSH_PRIVATE_KEY` — base64-encoded deploy key.
- `SONAR_TOKEN`, `SONAR_HOST_URL`, `SONAR_PROJECT_KEY`.
- `HML_HOST`, `PRD_HOST` — deploy targets.
- `DEPLOY_PATH`, `BACKUP_ROOT`, `SERVICE_NAME`, `HEALTH_PORT` — host paths and service identity.

Prefix the variable names with the service if a runner is shared across pipelines (e.g. `ORDERS_DEPLOY_PATH`). Never commit secrets to the repo. Production app secrets stay in the host's systemd `EnvironmentFile`.
