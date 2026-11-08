---
name: pipelines
description: "RDP CI/CD rules: Bitbucket pipelines, ci/ scripts, verify.sh, lint, deploys, NuGet feed and pipeline secrets. Use when touching CI/CD YAML, ci/ scripts, deploys or pipeline secrets."
---
# CI/CD pipelines

## Platform

- **Bitbucket Pipelines**, `bitbucket-pipelines.yml` at the repo root. Never edit pipelines in the
  Bitbucket UI; changes go through PR review like code.
- **Self-hosted Linux runners**: every step uses `runs-on: [self.hosted, linux, deploy, prod]`.
- **Base image**: `mcr.microsoft.com/dotnet/sdk:8.0`.

## Shape

```
main         : version-gate → [lint] → build+sonar → integration → publish → deploy HML → E2E HML → tag HML → [manual] deploy PRD → E2E PRD → tag PRD
pull request : version-gate → [lint] → build+sonar → integration
manual-build : [lint] → build+sonar → integration

[lint] = only when the project enables it.
```

The PR pipeline mirrors the start of `main`, so green on PR means green on merge through unit and
integration. Deploys never run from a PR.

## One verify script: local = pipeline

Every quality gate lives in **`ci/verify.sh`** (start from `${CLAUDE_PLUGIN_ROOT}/templates/ci/`).
Developers and Claude run it locally; the pipeline calls one gate per step. Logic lives in `ci/`
scripts, never inline in the YAML. CI-only setup (fresh clone, JRE, scanner, NuGet credentials) stays
in the YAML step, so the gates behave the same on a dev box and a runner. Commit `ci/*.sh` with
`eol=lf` (`.gitattributes`).

```
ci/verify.sh                 # lint → build-sonar → integration, stops at the first failure
ci/verify.sh <gate>          # one gate: lint | build-sonar | integration
ci/verify.sh --skip-sonar    # local only, and only when the developer says so; refused in CI
```

- **lint**: off for .NET (`LINT_ENABLED=false`; the compiler and Sonar cover it). TypeScript: `eslint`
  + `tsc --noEmit`, only where the project already has ESLint. The project's `CLAUDE.md` says which.
- **build-sonar**: a failed quality gate doesn't stop the run, so one verify shows everything; the
  script exits non-zero at the end. Build, test or Sonar setup errors stop at once. Missing Sonar setup
  fails; it never falls back to skipping. Reading the result: the `sonar` skill.
- **integration**: as `rdp-mode` → "Tests" says. The pipeline needs no database service.

## Build + unit tests + Sonar (one step)

Sonar instruments MSBuild, so `begin → build → test → end` run in the same step:

1. Clone fresh into `repo/` with `$BITBUCKET_ACCESS_TOKEN`, **full history** (never `--depth`; with
   the runner's checkout, `clone: depth: full`). Sonar needs it to tell which lines a PR changed.
2. Install `openjdk-17-jre-headless`, `libicu-dev` and the `dotnet-sonarscanner` global tool
   (`$HOME/.dotnet/tools` on `PATH`). Add the private NuGet feed `pntomni` (`$NUGET_USER` /
   `$NUGET_PASS`).
3. `dotnet restore`, before Sonar begin (restore isn't instrumented).
4. `bash ci/sonar-begin.sh "$SONAR_PROJECT_KEY"`: the only place `sonarscanner begin` is called. It
   adds host, token, `sonar.qualitygate.wait=true`, the version `$BITBUCKET_BUILD_NUMBER` (so the new-code
   period moves) and every line of `ci/sonar-analysis.properties` (coverage path, exclusions, ignored
   rules; project-specific ones with a comment saying why).
5. `dotnet build --no-restore --configuration Release`.
6. `dotnet test` the unit tests with Coverlet opencover to `coverage/`; fail if
   `coverage/coverage.opencover.xml` is missing or empty (`test -s`), or Sonar reports 0%.
7. `dotnet sonarscanner end`, capturing its exit code (`set +e … set -e`).

## Publish

`dotnet publish` the main project to `../artifacts/`. **Delete the base `appsettings.json` from the
artifact** (local-dev defaults, never shipped); each deploy renames its `appsettings.{ENV}.json`.

## Deploy (HML and PRD)

Same script, different host: SSH to an Ubuntu box running the app as a systemd service.

1. Load `$SSH_PRIVATE_KEY` (base64), `ssh-keyscan` the host, check SSH access.
2. `systemctl stop <SERVICE_NAME>`: **the site is offline until step 6**.
3. Back up the current deploy to `$BACKUP_ROOT/<service-name>_{ENV}_{timestamp}/` (manual rollback).
4. Wipe `$DEPLOY_PATH`.
5. Rename `appsettings.{ENV}.json` to `appsettings.json`, `scp -r` the artifact.
6. `systemctl start <SERVICE_NAME>`.
7. Poll `/health/live`, then `/health/ready` (DB connectivity) on `127.0.0.1:<HEALTH_PORT>`, up to 60s each.
8. HML behind a load balancer: poll a public smoke endpoint, up to ~2.5 min, then sleep 30s before E2E.

Production app secrets come from the host's systemd `EnvironmentFile`, never `appsettings.json`.

## End-to-end tests

Against the **deployed environment**, never a local build.

- **HML**: `E2E_BASE_URL` = the public HML URL.
- **PRD**: the app listens only on `127.0.0.1:<HEALTH_PORT>`: SSH tunnel to it, then a read-only subset.

## Version gate (delivery ledger)

Every successful delivery is a lightweight git tag `<prefix>-<version>`: `<Version>` from the main
`.csproj`, `<prefix>` the environment (`hml`, `prd-sim`, `prd-app`, …). The tags are the ledger.

- **Gate first**: `ci/version-gate.sh <prefix>`, first step on `main` and on PRs. Fails unless
  `<Version>` is strictly greater than the highest `<prefix>-*` tag, compared with `sort -V`. Blocks
  re-deploys and downgrades before any build.
- **Tag last**: `ci/version-tag.sh <prefix>` after E2E passes. No `tags:` trigger, or the push starts
  another run.
- Every merge to `main` that deploys bumps `<Version>`; say so in the project's `CLAUDE.md`.
- The tag push needs `BITBUCKET_ACCESS_TOKEN` with `repository:write`, repo-scoped, with a branch
  restriction on `main`.
- No zero-padded version fields (`1.0.11.00`): `sort -V` can let one slip past.

## Environments

- **HML**: `deployment: staging`, auto-deploys on every push to `main`.
- **PRD**: `deployment: production`, `trigger: manual`, after HML E2E passes.

## Secrets

Bitbucket Repository Settings → Repository variables. Standard set:

- `BITBUCKET_ACCESS_TOKEN` (clone and tag push, `repository:write`), `NUGET_USER`, `NUGET_PASS`.
- `SSH_PRIVATE_KEY` (base64), `HML_HOST`, `PRD_HOST`, `DEPLOY_PATH`, `BACKUP_ROOT`, `SERVICE_NAME`,
  `HEALTH_PORT`.
- `SONAR_TOKEN`, `SONAR_HOST_URL`, `SONAR_PROJECT_KEY`.

Prefix them with the service on a shared runner (e.g. `ORDERS_DEPLOY_PATH`). Never commit secrets.
