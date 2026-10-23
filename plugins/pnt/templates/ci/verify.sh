#!/usr/bin/env bash
# Reference ci/verify.sh for PnT .NET projects. Copy it to the project's ci/
# folder, fill in the "Project settings" block (same values as the project's
# CLAUDE.md "Sonar" section and the pipeline), and commit it with eol=lf.
# Rules behind it: the pnt plugin's pipelines skill -> "One verify script",
# and sonar.md for how the Sonar result is read and reported.
#
# Sonar analysis parameters (coverage path, exclusions, ignored rules) are
# not in this file: they live in ci/sonar-analysis.properties and are applied
# by ci/sonar-begin.sh, which the pipeline calls too.
#
# Usage:
#   ci/verify.sh [lint|build-sonar|integration] [--skip-sonar]
#
# No gate argument runs all enabled gates in order (lint only if
# LINT_ENABLED=true). Sonar runs by default:
#   - interactive terminal: asks "Run Sonar analysis? [Y/n]" (Enter = yes)
#   - non-interactive (agents, hooks, CI): never prompts, runs Sonar
#   - --skip-sonar: skips Sonar locally; refused in CI (CI=true)
#
# Local runs analyze into a per-developer project (<key>-local-<dev>), never
# the official one: our server (Community Build) has no branch analysis, so a
# local run on the official key would overwrite the main analysis.
#
# SONAR_HOST_URL and SONAR_TOKEN come from the environment. Never hard-code
# them here, and never echo the token.
set -euo pipefail

# ---------- Project settings (not secrets) ----------
SOLUTION="<Solution>.sln"
UNIT_TESTS="<tests/Project.Tests.Unit/Project.Tests.Unit.csproj>"
INTEGRATION_TESTS="<tests/Project.Tests.Integration/Project.Tests.Integration.csproj>"
# The official project key (the one the pipeline uses).
SONAR_PROJECT_KEY="<sonar-project-key>"
# Where the unit-test step writes coverage. Must match
# sonar.cs.opencover.reportsPaths in ci/sonar-analysis.properties.
COVERAGE_DIR="coverage"
# .NET: lint is off by default — the compiler and Sonar cover code quality.
# Revisit only if we adopt a shared .editorconfig (pipelines.md -> "Lint").
LINT_ENABLED=false
# Branch this work merges into (Flow B: main; Flow A: the release branch).
# Override per run with VERIFY_BASE_BRANCH=release/3.13.x.
BASE_BRANCH="${VERIFY_BASE_BRANCH:-main}"

SONAR_REPORT_DIR=".sonarqube/report"
SONAR_ISSUES_PAGE_SIZE=500
# api/issues/search returns at most 10,000 results (20 pages of 500).
SONAR_ISSUES_MAX_PAGES=20
RUN_SONAR=true
SONAR_RESULT="not run"
SONAR_KEY=""       # key actually analyzed: official in CI, per-developer locally
SONAR_LOCAL_DEV=""
# A failed quality gate doesn't stop the run: the remaining gates still run so
# one verify gives the full picture, and the script exits non-zero at the end.
QUALITY_GATE_FAILED=false

main() {
  local gate="all" skip_sonar=false
  for arg in "$@"; do
    case "$arg" in
      lint|build-sonar|integration) gate="$arg" ;;
      --skip-sonar) skip_sonar=true ;;
      -h|--help) usage; exit 0 ;;
      *) usage; exit 2 ;;
    esac
  done

  # Sonar reports paths relative to the analysis root; run from the repo root
  # so they line up with `git diff` paths.
  cd "$(dirname "$0")/.."

  if [[ "${CI:-}" == "true" && "$skip_sonar" == true ]]; then
    echo "verify: --skip-sonar is not allowed in CI. CI always runs Sonar." >&2
    exit 2
  fi

  if [[ "$gate" == "all" || "$gate" == "build-sonar" ]]; then
    decide_sonar "$skip_sonar"
  fi

  case "$gate" in
    all) lint_if_enabled; build_sonar; integration ;;
    lint) lint ;;
    build-sonar) build_sonar ;;
    integration) integration ;;
  esac

  if [[ "$QUALITY_GATE_FAILED" == true ]]; then
    echo "verify: FAILED — Sonar quality gate failed (details above and in $SONAR_REPORT_DIR/)" >&2
    exit 1
  fi
  echo "verify: all requested gates passed (sonar: $SONAR_RESULT)"
}

usage() {
  echo "Usage: ci/verify.sh [lint|build-sonar|integration] [--skip-sonar]"
}

# Sets RUN_SONAR. Only prompts on an interactive local terminal, so agents,
# hooks and CI (no TTY) always get the default: run Sonar.
decide_sonar() {
  local skip_sonar="$1"
  if [[ "$skip_sonar" == true ]]; then
    RUN_SONAR=false
    return
  fi
  if [[ "${CI:-}" != "true" && -t 0 && -t 1 ]]; then
    local answer
    read -r -p "Run Sonar analysis? [Y/n] " answer
    case "${answer:-y}" in
      [nN]|[nN][oO]) RUN_SONAR=false ;;
      *) RUN_SONAR=true ;;
    esac
  fi
}

lint_if_enabled() {
  if [[ "$LINT_ENABLED" != true ]]; then
    echo "verify: [lint] disabled for this project (LINT_ENABLED=false)"
    return
  fi
  lint
}

lint() {
  echo "verify: [lint] dotnet format"
  dotnet format "$SOLUTION" --verify-no-changes
}

# Sonar instruments MSBuild, so begin -> build -> test -> end must stay in one gate.
build_sonar() {
  # Check the setup first so a missing config fails before any build work.
  if [[ "$RUN_SONAR" == true ]]; then
    require_sonar_config
    resolve_sonar_key
    if [[ "${CI:-}" != "true" ]]; then
      ensure_local_project
    fi
  fi

  echo "verify: [build-sonar] restore"
  dotnet restore "$SOLUTION"

  if [[ "$RUN_SONAR" == true ]]; then
    echo "verify: [build-sonar] sonar begin ($SONAR_KEY)"
    # Same script and parameters the pipeline uses — see ci/sonar-analysis.properties.
    bash ci/sonar-begin.sh "$SONAR_KEY"
  else
    # Exact marker line: agents look for it to report the skip in the PR.
    echo "verify: SONAR SKIPPED (local run, developer choice). CI will run it."
    SONAR_RESULT="SKIPPED"
  fi

  echo "verify: [build-sonar] build"
  dotnet build "$SOLUTION" --no-restore --configuration Release

  echo "verify: [build-sonar] unit tests"
  mkdir -p "$COVERAGE_DIR"
  dotnet test "$UNIT_TESTS" --no-build --configuration Release \
    /p:CollectCoverage=true /p:CoverletOutputFormat=opencover \
    /p:CoverletOutput="$(pwd)/$COVERAGE_DIR/"
  # Without this, Sonar silently reports 0% coverage when coverlet didn't run.
  if [[ ! -s "$COVERAGE_DIR/coverage.opencover.xml" ]]; then
    echo "verify: $COVERAGE_DIR/coverage.opencover.xml is missing or empty — coverlet didn't produce coverage." >&2
    exit 1
  fi

  if [[ "$RUN_SONAR" == true ]]; then
    sonar_end_and_report
  fi
}

# CI analyzes the official project. Locally: <official-key>-local-<dev>, where
# <dev> is SONAR_LOCAL_USER or the local part of `git config user.email`.
resolve_sonar_key() {
  if [[ "${CI:-}" == "true" ]]; then
    SONAR_KEY="$SONAR_PROJECT_KEY"
    return
  fi
  local dev="${SONAR_LOCAL_USER:-}"
  if [[ -z "$dev" ]]; then
    dev="$(git config user.email || true)"
    dev="${dev%%@*}"
  fi
  # Project keys allow letters, digits, '-', '_' and '.'.
  dev="$(printf '%s' "$dev" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9._-' '-')"
  if [[ -z "$dev" ]]; then
    echo "verify: can't name your local Sonar project: set SONAR_LOCAL_USER or git user.email." >&2
    exit 1
  fi
  SONAR_LOCAL_DEV="$dev"
  SONAR_KEY="${SONAR_PROJECT_KEY}-local-${dev}"
}

# Creates the per-developer project on first run, then (every run) copies the
# official project's quality gate and quality profiles onto it, so a local
# result is judged by the same rules. Never falls back to server defaults.
ensure_local_project() {
  local status=0
  sonar_api GET api/components/show "component=$SONAR_KEY" >/dev/null || status=$?
  case "$status" in
    0) ;;
    4)
      echo "verify: [sonar] creating your local Sonar project $SONAR_KEY"
      sonar_api POST api/projects/create \
        "project=$SONAR_KEY" "name=$SONAR_PROJECT_KEY (local: $SONAR_LOCAL_DEV)" >/dev/null \
        || sonar_permission_error "create your local project $SONAR_KEY" \
             "the global 'Create Projects' permission (ask the Sonar admin to grant it to the developers group)"
      ;;
    *) sonar_permission_error "read project $SONAR_KEY" "'Browse' on $SONAR_KEY" ;;
  esac
  sync_quality_gate
  sync_quality_profiles
}

sync_quality_gate() {
  local gate_json gate_name
  gate_json="$(sonar_api GET api/qualitygates/get_by_project "project=$SONAR_PROJECT_KEY")" \
    || sonar_permission_error "read the quality gate of $SONAR_PROJECT_KEY" "'Browse' on $SONAR_PROJECT_KEY"
  gate_name="$(jq -r '.qualityGate.name' <<<"$gate_json")"
  sonar_api POST api/qualitygates/select "projectKey=$SONAR_KEY" "gateName=$gate_name" >/dev/null \
    || sonar_permission_error "assign quality gate '$gate_name' to $SONAR_KEY" "$(local_admin_hint)"
  echo "verify: [sonar] quality gate: $gate_name (same as $SONAR_PROJECT_KEY)"
}

sync_quality_profiles() {
  local profiles_json language profile_name
  profiles_json="$(sonar_api GET api/qualityprofiles/search "project=$SONAR_PROJECT_KEY")" \
    || sonar_permission_error "read the quality profiles of $SONAR_PROJECT_KEY" "'Browse' on $SONAR_PROJECT_KEY"
  while IFS=$'\t' read -r language profile_name; do
    sonar_api POST api/qualityprofiles/add_project \
      "project=$SONAR_KEY" "language=$language" "qualityProfile=$profile_name" >/dev/null \
      || sonar_permission_error "assign quality profile '$profile_name' ($language) to $SONAR_KEY" "$(local_admin_hint)"
    echo "verify: [sonar] quality profile: $language -> $profile_name"
  done < <(jq -r '.profiles[] | [.language, .name] | @tsv' <<<"$profiles_json")
}

local_admin_hint() {
  echo "'Administer' on $SONAR_KEY. Project creators get it only if the server's default permission template grants 'Administer' to 'Project Creators' — ask the Sonar admin to check (Administration -> Security -> Permission Templates)"
}

# sonar_api <GET|POST> <api/path> [name=value ...] — prints the response body.
# Returns 0 on 2xx, 4 on 404, 3 on 401/403, 1 otherwise (with a message).
sonar_api() {
  local method="$1" path="$2"
  shift 2
  local args=() pair body_file http_code
  for pair in "$@"; do args+=(--data-urlencode "$pair"); done
  body_file="$(mktemp)"
  if [[ "$method" == "GET" ]]; then
    http_code="$(curl -sS -G -u "$SONAR_TOKEN:" -o "$body_file" -w '%{http_code}' "${args[@]}" "$SONAR_HOST_URL/$path")" || http_code="000"
  else
    http_code="$(curl -sS -X POST -u "$SONAR_TOKEN:" -o "$body_file" -w '%{http_code}' "${args[@]}" "$SONAR_HOST_URL/$path")" || http_code="000"
  fi
  local rc=0
  case "$http_code" in
    2??) cat "$body_file" ;;
    404) rc=4 ;;
    401|403) rc=3 ;;
    *) echo "verify: Sonar API $method $path failed (HTTP $http_code)." >&2; rc=1 ;;
  esac
  rm -f "$body_file"
  return "$rc"
}

sonar_permission_error() {
  local action="$1" needs="$2"
  echo "verify: your Sonar token can't $action." >&2
  echo "verify: needs $needs." >&2
  echo "verify: not falling back to server defaults — fix the permission, or skip Sonar for this run with --skip-sonar." >&2
  exit 1
}

# qualitygate.wait=true makes `sonarscanner end` exit non-zero when the gate
# fails, but also on real errors (server unreachable, bad token). The gate
# status from the API tells the two apart.
sonar_end_and_report() {
  echo "verify: [build-sonar] sonar end (waits for the quality gate)"
  local end_status=0
  dotnet sonarscanner end /d:sonar.token="$SONAR_TOKEN" || end_status=$?

  mkdir -p "$SONAR_REPORT_DIR"
  sonar_api GET api/qualitygates/project_status "projectKey=$SONAR_KEY" > "$SONAR_REPORT_DIR/quality-gate.json" \
    || { echo "verify: could not read the quality gate of $SONAR_KEY." >&2; exit 1; }
  local gate_status
  gate_status="$(quality_gate_status)"
  echo "verify: [sonar] quality gate ($SONAR_KEY): $gate_status"
  print_gate_conditions

  if [[ "${CI:-}" == "true" ]]; then
    report_ci_new_code_issues
  else
    report_local_issues
  fi

  case "$gate_status" in
    OK)
      if [[ "$end_status" -ne 0 ]]; then
        echo "verify: sonarscanner end failed although the gate is OK — see output above." >&2
        exit 1
      fi
      SONAR_RESULT="quality gate OK"
      ;;
    ERROR)
      SONAR_RESULT="quality gate FAILED"
      QUALITY_GATE_FAILED=true
      ;;
    *)
      echo "verify: could not read the quality gate status (got '$gate_status')." >&2
      exit 1
      ;;
  esac
}

# Prints OK / ERROR / NONE. The API returns the overall status first
# ({"projectStatus":{"status":...), so this works without jq (CI images).
quality_gate_status() {
  sed -n 's/^{"projectStatus":{"status":"\([A-Z]*\)".*/\1/p' "$SONAR_REPORT_DIR/quality-gate.json"
}

print_gate_conditions() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "verify: [sonar] install jq for a per-condition summary; raw result: $SONAR_REPORT_DIR/quality-gate.json"
    return
  fi
  jq -r '.projectStatus.conditions[]
    | "verify: [sonar]   \(.status)  \(.metricKey) \(.comparator) \(.errorThreshold) (actual: \(.actualValue // "n/a"))"' \
    "$SONAR_REPORT_DIR/quality-gate.json"
}

# CI (official project): Sonar's own new-code period applies. Both filters are
# load-bearing — see sonar.md -> "Reading the result".
report_ci_new_code_issues() {
  sonar_api GET api/issues/search "componentKeys=$SONAR_KEY" "inNewCodePeriod=true" \
    "issueStatuses=OPEN,CONFIRMED" "ps=100" > "$SONAR_REPORT_DIR/new-code-issues.json" \
    || { echo "verify: could not read issues of $SONAR_KEY." >&2; exit 1; }
  if command -v jq >/dev/null 2>&1; then
    jq -r '"verify: [sonar] open issues in new code: \(.paging.total)"' "$SONAR_REPORT_DIR/new-code-issues.json"
  fi
}

# Local (per-developer project): its new-code period means nothing, so fetch
# every open issue and classify by this branch's diff instead. See sonar.md ->
# "Local projects: git diff replaces inNewCodePeriod".
report_local_issues() {
  fetch_all_open_issues
  write_changed_lines
  classify_issues
  print_classified_issues
}

fetch_all_open_issues() {
  local page=1 total
  rm -f "$SONAR_REPORT_DIR"/issues-page-*.json
  while :; do
    sonar_api GET api/issues/search "componentKeys=$SONAR_KEY" "issueStatuses=OPEN,CONFIRMED" \
      "ps=$SONAR_ISSUES_PAGE_SIZE" "p=$page" > "$SONAR_REPORT_DIR/issues-page-$page.json" \
      || { echo "verify: could not read issues of $SONAR_KEY." >&2; exit 1; }
    total="$(jq '.paging.total' "$SONAR_REPORT_DIR/issues-page-$page.json")"
    if (( page * SONAR_ISSUES_PAGE_SIZE >= total )); then
      break
    fi
    if (( page >= SONAR_ISSUES_MAX_PAGES )); then
      echo "verify: [sonar] $total open issues; the API returns at most $((SONAR_ISSUES_MAX_PAGES * SONAR_ISSUES_PAGE_SIZE)). Classification covers those only." >&2
      break
    fi
    page=$((page + 1))
  done
  jq -s '{total: .[0].paging.total, issues: (map(.issues) | add)}' \
    "$SONAR_REPORT_DIR"/issues-page-*.json > "$SONAR_REPORT_DIR/open-issues.json"
  rm -f "$SONAR_REPORT_DIR"/issues-page-*.json
}

# Writes "path<TAB>first-line<TAB>last-line" for every line this work added or
# changed: committed on the branch, staged, unstaged, and untracked files. The
# analysis ran on the working tree, so the diff must cover it too.
write_changed_lines() {
  local base
  base="$(git merge-base HEAD "origin/$BASE_BRANCH" 2>/dev/null || git merge-base HEAD "$BASE_BRANCH" 2>/dev/null)" || {
    echo "verify: can't find the base branch '$BASE_BRANCH' (set VERIFY_BASE_BRANCH)." >&2
    exit 1
  }
  echo "$base" > "$SONAR_REPORT_DIR/diff-base.txt"
  {
    git diff --unified=0 --no-color --no-ext-diff "$base" -- \
      | awk '
          /^\+\+\+ / { f = substr($0, 5); sub(/^b\//, "", f); next }
          /^@@ / {
            split($3, a, ","); start = substr(a[1], 2); n = (a[2] == "") ? 1 : a[2]
            if (n > 0 && f != "/dev/null") print f "\t" start "\t" start + n - 1
          }'
    git ls-files --others --exclude-standard | awk '{ print $0 "\t1\t2147483647" }'
  } > "$SONAR_REPORT_DIR/changed-lines.tsv"
}

# Issue on a changed line -> "new from this work". An issue without a line
# (file-level) counts as new when its file is in the diff. Everything else is
# pre-existing debt. Grouping uses MQR `impacts`, never legacy type/severity.
classify_issues() {
  jq -n \
    --arg key "$SONAR_KEY" \
    --arg base "$(cat "$SONAR_REPORT_DIR/diff-base.txt")" \
    --slurpfile open "$SONAR_REPORT_DIR/open-issues.json" \
    --rawfile ranges "$SONAR_REPORT_DIR/changed-lines.tsv" '
    def quality_rank: {"SECURITY":0,"RELIABILITY":1,"MAINTAINABILITY":2}[.] // 9;
    def severity_rank: {"BLOCKER":0,"HIGH":1,"MEDIUM":2,"LOW":3,"INFO":4}[.] // 9;
    # Most severe impact first: severity, then software quality.
    def top_impact: (.impacts // []) | sort_by([(.severity | severity_rank), (.softwareQuality | quality_rank)]) | .[0];
    def counts_by_impact:
      [.[] | (.impacts // [])[]]
      | group_by([(.softwareQuality | quality_rank), (.severity | severity_rank)])
      | map({softwareQuality: .[0].softwareQuality, severity: .[0].severity, count: length});

    ($ranges | split("\n") | map(select(length > 0) | split("\t")
      | {file: .[0], start: (.[1] | tonumber), end: (.[2] | tonumber)})) as $changed
    | ($open[0].issues | map(. + {path: (.component | ltrimstr($key + ":"))})) as $issues
    | ($issues | map(. as $i | select(any($changed[];
        .file == $i.path and ($i.line == null or ($i.line >= .start and $i.line <= .end))))))
      as $new
    | ($new | map(.key)) as $new_keys
    | ($issues | map(select(.key as $k | $new_keys | index($k) | not))) as $debt
    | {
        project: $key,
        diffBase: $base,
        totalOpen: $open[0].total,
        new: ($new
          | map({rule, path, line, message, impacts, top: top_impact})
          | sort_by([(.top.softwareQuality | quality_rank), (.top.severity | severity_rank), .path, (.line // 0)])),
        newCountsByImpact: ($new | counts_by_impact),
        debtCount: ($debt | length),
        debtCountsByImpact: ($debt | counts_by_impact),
        withoutImpacts: ($issues | map(select((.impacts // []) | length == 0)) | length)
      }' > "$SONAR_REPORT_DIR/classified-issues.json"
}

print_classified_issues() {
  jq -r '
    "verify: [sonar] open issues in \(.project): \(.totalOpen) (diff base \(.diffBase[0:12]))",
    "verify: [sonar] NEW FROM THIS WORK: \(.new | length)",
    (.new | group_by([.top.softwareQuality, .top.severity])[]
      | "verify: [sonar]   \(.[0].top.softwareQuality) / \(.[0].top.severity)",
        (.[] | "verify: [sonar]     \(.rule)  \(.path):\(.line // "-")  \(.message)"
          + (if (.impacts | length) > 1
             then "  [impacts: \([.impacts[] | "\(.softwareQuality)/\(.severity)"] | join(", "))]"
             else "" end))),
    "verify: [sonar] PRE-EXISTING DEBT: \(.debtCount) (counts by impact; an issue counts once per impact)",
    (.debtCountsByImpact[] | "verify: [sonar]   \(.softwareQuality) / \(.severity): \(.count)"),
    (if .withoutImpacts > 0
     then "verify: [sonar] \(.withoutImpacts) issue(s) without impacts — check the server is in MQR Mode"
     else empty end)' \
    "$SONAR_REPORT_DIR/classified-issues.json"
}

integration() {
  echo "verify: [integration] integration tests"
  dotnet test "$INTEGRATION_TESTS" --configuration Release
}

# Fails the gate when Sonar should run but isn't configured. Never falls back
# to skipping: a missing setup is an error, locally and in CI.
require_sonar_config() {
  local missing=()
  [[ -n "${SONAR_HOST_URL:-}" ]] || missing+=("SONAR_HOST_URL")
  [[ -n "${SONAR_TOKEN:-}" ]] || missing+=("SONAR_TOKEN")
  command -v dotnet-sonarscanner >/dev/null 2>&1 || missing+=("dotnet-sonarscanner (global tool)")
  command -v java >/dev/null 2>&1 || missing+=("java (Java 17+ runtime)")
  command -v curl >/dev/null 2>&1 || missing+=("curl")
  # Locally, jq drives the local-project setup and the issue classification.
  if [[ "${CI:-}" != "true" ]]; then
    command -v jq >/dev/null 2>&1 || missing+=("jq")
    command -v git >/dev/null 2>&1 || missing+=("git")
  fi
  [[ ${#missing[@]} -eq 0 ]] && return

  echo "verify: Sonar is not configured. Missing: ${missing[*]}" >&2
  if [[ "${CI:-}" == "true" ]]; then
    echo "verify: set the missing pipeline variables / runner tools (pipelines.md -> Secrets)." >&2
  else
    cat >&2 <<'SETUP'
Set up local Sonar once (full steps: pnt-claude-marketplace README -> "Local Sonar setup", and the sonar skill):
  1. Install Java 17+, jq, and the scanner: dotnet tool install --global dotnet-sonarscanner
  2. Create a personal token on the Sonar server: My Account -> Security -> Generate Token
  3. Set user environment variables SONAR_HOST_URL and SONAR_TOKEN (never commit them)
  4. Open a new terminal and run: ci/verify.sh build-sonar
Or skip Sonar for this local run only: ci/verify.sh --skip-sonar
SETUP
  fi
  exit 1
}

main "$@"
