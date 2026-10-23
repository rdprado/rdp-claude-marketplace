---
name: sonar
description: How PnT runs Sonar locally and reads the quality gate and issues. Use when running ci/verify.sh, reading a Sonar result, or touching Sonar config.
---
# Sonar

How we run Sonar locally against our Sonar server, and how to read the result. Read when running `ci/verify.sh`, acting as the `verifier`, reading a quality gate result, or touching Sonar config. Pipeline wiring is in the `pipelines` skill; project-specific values (project key, coverage path, current pass bar) are in each project's `CLAUDE.md` ("Sonar" section).

Why local: a quality gate failure found in CI costs a full pipeline run and arrives in a format that's hard to act on. Running the same analysis locally, before pushing, catches it early and gives a result Claude can read directly.

## Our server

- **SonarQube Community Build v26.4.0**, running in **MQR Mode** (Multi-Quality Rule Mode).
- **Community Build has no branch or pull-request analysis.** Every analysis sent to a project key replaces that project's single analysis, and its new-code period is the project's, not your branch's. That's why "new from this work" is decided from `git diff` (see "Reporting"), not from Sonar alone.
- **MQR Mode** classifies each issue by **impacts**: a list of `{ softwareQuality, severity }` pairs, where `softwareQuality` is `SECURITY`, `RELIABILITY` or `MAINTAINABILITY`, and `severity` is `BLOCKER`, `HIGH`, `MEDIUM`, `LOW` or `INFO`. One issue can have more than one impact. Read and group by `impacts`. **Don't use the legacy `type` (`BUG`/`VULNERABILITY`/`CODE_SMELL`) or `severity` (`MAJOR`, `CRITICAL`, …) fields** — they are Standard Experience fields and don't match what the server's gate and UI use in MQR Mode.
- The token is passed as `sonar.token` (the parameter this server version expects).

## Rules

- **Sonar runs by default** as part of `ci/verify.sh`. Skipping is local-only and needs the developer's explicit choice (`--skip-sonar`, or `n` at the prompt). CI always runs it. Agents never skip on their own: the developer is asked before each run. See the `pipelines` skill → "Sonar: on by default, skippable only locally".
- **Run it before pushing any non-trivial change**, not only when something feels risky.
- **Secrets come from the environment only.** `SONAR_HOST_URL` and `SONAR_TOKEN` are environment variables. Never commit them, never write them in a project file, never paste the token into chat, never echo it. Commands below reference `$SONAR_TOKEN`; they never contain its value.
- **Don't treat pre-existing debt as yours to silently fix or silently ignore.** Split it out and let the developer decide (see "Reporting").

## Scanner setup (once per machine)

- **Java 17+** — the scanner engine needs it whatever the project's language (`java -version`). Any JDK/JRE 17 (e.g. Temurin 17) works; it doesn't need to match the project's runtime.
- **.NET** — `dotnet tool install --global dotnet-sonarscanner`. It wraps the build: `dotnet sonarscanner begin …` → `dotnet build` → `dotnet test` (with coverage) → `dotnet sonarscanner end`, all in one run, because it instruments MSBuild. `${CLAUDE_PLUGIN_ROOT}/templates/ci/verify.sh` does this.
- **TypeScript / npm** — `npm install --save-dev sonarqube-scanner`, run through an npm script (`npx sonar-scanner …`; check the package's `bin` in its `package.json` for the exact command name in your version). Stateless: generate coverage first, then one scanner call — no begin/end.
- **Environment variables** — `SONAR_HOST_URL` (the server; same value as the Bitbucket repository variable) and `SONAR_TOKEN` (personal token: Sonar web → My Account → Security → Generate Token). Setup steps: README → "Local Sonar setup".
- **Gitignore the scanner's working directory** — `.sonarqube/` (.NET) or `.scannerwork/` (JS/TS). It's a build artifact.

## Running

- **Always pass `sonar.qualitygate.wait=true`** (`/d:sonar.qualitygate.wait=true` for .NET, `-Dsonar.qualitygate.wait=true` for npm). It makes the scanner block until the server has processed the analysis and fail if the gate fails, instead of the result only appearing later in the dashboard.
- **Analysis parameters live in the project's `ci/sonar-analysis.properties`** and are applied by `ci/sonar-begin.sh`, which both the pipeline and `verify.sh` call — so exclusions and ignored rules apply identically in CI, locally and to your per-developer project. Project-specific exclusions stay in that project; see the `pipelines` skill → *Sonar analysis parameters*.
- **Match the pipeline exactly** — same coverage format and report path (opencover for .NET, lcov for TS), and the same quality gate and quality profiles as the official project. Take the values from the project's `CLAUDE.md` / `ci/verify.sh`; don't guess. If they differ from the pipeline, fix the difference first.

## Local projects: one per developer

Because Community Build has no branch analysis, **a local run never analyzes into the official project** — it would overwrite the main analysis everyone relies on. Instead:

- **CI** analyzes the official key (`SONAR_PROJECT_KEY` in `ci/verify.sh`).
- **Locally**, `ci/verify.sh` analyzes `<official-key>-local-<dev>`, where `<dev>` is `SONAR_LOCAL_USER` if set, otherwise the part of your git email before `@` (lower-cased; characters not allowed in a key become `-`).
- **First run creates the project** (`api/projects/create`). This needs the global **Create Projects** permission (granted to the developers group).
- **Every run copies the official project's quality gate and quality profiles** onto the local project (`api/qualitygates/get_by_project` → `select`; `api/qualityprofiles/search` → `add_project`), so a local result is judged by the same rules as CI. This needs **Administer** on the local project, which project creators get only if the server's default permission template grants "Administer" to "Project Creators".
- **No fallback to server defaults.** If any of these calls is refused, the script fails and names the permission it needs. A local result judged by the default gate or default profiles would be misleading, so it's not produced at all.
- The local project's quality gate result is a guide, not the verdict: its new-code period is its own history, not your branch. The verdict for the official project is the CI run. What the local run gives you reliably is the issue list, classified by `git diff` (below).

## Reading the result: the web API, not scanner output

Read the result from the API — not from scanner stdout, and never from an issues query without a status filter. `ci/verify.sh` saves everything under `.sonarqube/report/`.

**Official project (CI):**

```bash
curl -sS -u "$SONAR_TOKEN:" "$SONAR_HOST_URL/api/qualitygates/project_status?projectKey=<official-key>"
curl -sS -u "$SONAR_TOKEN:" "$SONAR_HOST_URL/api/issues/search?componentKeys=<official-key>&inNewCodePeriod=true&issueStatuses=OPEN,CONFIRMED&ps=100"
```

**Both filters on the issues call are load-bearing — always use them:**

- `inNewCodePeriod=true` — without it you get the project's whole historical backlog, not what you're about to push.
- `issueStatuses=OPEN,CONFIRMED` — without it, issues already fixed in a previous run (issue status `FIXED`) look identical to open ones. If a fix "didn't work", check the issue's `issueStatus` before assuming the code change failed — it's most likely a stale record from the previous run. (`issueStatuses` replaced the deprecated `statuses=OPEN,CONFIRMED,REOPENED`; reopened issues now report as `OPEN`.)

`ps=100` is one page. If `paging.total` is higher, fetch the next pages (`&p=2`, …) before concluding anything.

**Local project: `git diff` replaces `inNewCodePeriod`.** A per-developer project's new-code period is its own history, not your branch, so `inNewCodePeriod=true` would give the wrong window. Locally, fetch **all** open issues and classify them by the diff instead:

```bash
curl -sS -u "$SONAR_TOKEN:" "$SONAR_HOST_URL/api/issues/search?componentKeys=<official-key>-local-<dev>&issueStatuses=OPEN,CONFIRMED&ps=500&p=1"
```

- `issueStatuses=OPEN,CONFIRMED` stays load-bearing locally, for the same reason.
- Page through all results (`p=2`, …; the API stops at 10,000).
- The diff is against the merge base with the base branch (`origin/main` by default; `VERIFY_BASE_BRANCH` for Flow A) and includes committed, staged, unstaged and untracked changes, because the analysis ran on the working tree.
- `ci/verify.sh` writes the result to `.sonarqube/report/classified-issues.json`: the list of new issues, and counts for the rest.

## Reporting

Report in this shape — short, no raw JSON or logs:

1. **Gate status, condition by condition**: metric, comparator, threshold, actual value, OK/ERROR — for every condition, not just the failing ones. Report the metric keys as the API returns them.
2. **Issues, split in two:**
   - **New from this work** — the issue is on a line this work added or changed (see the diff rules above). An issue with no line (file-level) counts as new when its file is in the diff. These are yours to fix. **Full list**, grouped by impact: software quality, then impact severity (`SECURITY` → `RELIABILITY` → `MAINTAINABILITY`; `BLOCKER` → `HIGH` → `MEDIUM` → `LOW` → `INFO`). For each issue: rule key, every impact it has, `file:line`, one-line message. An issue with two impacts is listed under its most severe one and shows both.
   - **Pre-existing debt** — every other open issue. **Counts only**, by impact (software quality / impact severity; an issue with two impacts counts in both). Don't list, fix or dismiss them without the developer's decision.

   An issue with no `impacts` is reported as such — it means the server isn't returning MQR data.
3. **Against the project's pass bar** — for each failing condition, say whether the project's `CLAUDE.md` lists it as known pre-existing debt. Known debt is reported, not blocking; anything else is blocking.

When the project's pass bar and the pipeline's gate differ, report both: what "passing" means for this project today, and what the pipeline gate ultimately requires.
