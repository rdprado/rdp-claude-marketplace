#!/usr/bin/env bash
# Prepares a Bitbucket pull request for the current branch with the team's PR
# template: copies the description to the clipboard, prints it, and prints the
# title and the Bitbucket "create PR" link. The developer creates the PR in the
# browser. No token, no API call, no files written.
# Used by /pnt:implement (main session) and by developers.
#
# Runs from the pnt plugin — it is NOT copied into projects and never
# runs in CI. Run it from inside the project repo:
#
#   ${CLAUDE_PLUGIN_ROOT}/templates/ci/open-pr.sh \
#     --issue 1234 --title "add order status webhook" \
#     --summary-file .claude/tmp/pr-summary.md \
#     --testing-file .claude/tmp/pr-testing.md \
#     --sonar-file   .claude/tmp/pr-sonar.md \
#     [--sonar-skipped] [--destination main] [--open]
#
# Why not the API: the claude.ai Atlassian connector has no Bitbucket tools,
# and a personal Bitbucket token per developer is a credential we'd rather not
# hand out for this. Pasting into the browser keeps PR creation token-free.
set -euo pipefail

ISSUE_NUMBER=""
TITLE=""
SUMMARY_FILE=""
TESTING_FILE=""
SONAR_FILE=""
SONAR_SKIPPED=false
DESTINATION="main"
OPEN_BROWSER=false

main() {
  parse_args "$@"

  local source_branch workspace_repo description url pr_title
  source_branch="$(git rev-parse --abbrev-ref HEAD)"
  workspace_repo="$(bitbucket_workspace_repo)"
  require_pushed "$source_branch"

  description="$(write_description)"
  pr_title="#$ISSUE_NUMBER: $TITLE"
  url="https://bitbucket.org/$workspace_repo/pull-requests/new?source=$source_branch&dest=$DESTINATION"

  if copy_to_clipboard <<<"$description"; then
    echo "open-pr: description copied to the clipboard (also printed below)"
  else
    echo "open-pr: no clipboard tool found — copy the description printed below"
  fi
  echo
  echo "----- PR description -----"
  printf '%s
' "$description"
  echo "--------------------------"
  echo
  echo "  Title:       $pr_title"
  echo "  Destination: $DESTINATION"
  echo "  Create PR:   $url"
  echo
  echo "open-pr: open the link, paste the title and the description, check the destination, create the PR."

  if [[ "$OPEN_BROWSER" == true ]]; then
    open_in_browser "$url"
  fi
}

usage() {
  sed -n '11,17p' "$0" | sed 's/^# \{0,1\}//'
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --issue) ISSUE_NUMBER="$2"; shift ;;
      --title) TITLE="$2"; shift ;;
      --summary-file) SUMMARY_FILE="$2"; shift ;;
      --testing-file) TESTING_FILE="$2"; shift ;;
      --sonar-file) SONAR_FILE="$2"; shift ;;
      --sonar-skipped) SONAR_SKIPPED=true ;;
      --destination) DESTINATION="$2"; shift ;;
      --open) OPEN_BROWSER=true ;;
      -h|--help) usage; exit 0 ;;
      *) echo "open-pr: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
    esac
    shift
  done

  local missing=()
  [[ -n "$ISSUE_NUMBER" ]] || missing+=(--issue)
  [[ -n "$TITLE" ]] || missing+=(--title)
  [[ -n "$SUMMARY_FILE" ]] || missing+=(--summary-file)
  [[ -n "$TESTING_FILE" ]] || missing+=(--testing-file)
  [[ -n "$SONAR_FILE" ]] || missing+=(--sonar-file)
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "open-pr: missing ${missing[*]}" >&2
    exit 2
  fi
  if [[ ! "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
    echo "open-pr: --issue must be a GitHub issue number like 1234 (got '$ISSUE_NUMBER')." >&2
    exit 2
  fi
  local f
  for f in "$SUMMARY_FILE" "$TESTING_FILE" "$SONAR_FILE"; do
    [[ -s "$f" ]] || { echo "open-pr: $f is missing or empty." >&2; exit 2; }
  done
}

# workspace/repo from the origin URL (https or ssh form).
bitbucket_workspace_repo() {
  local url
  url="$(git remote get-url origin)"
  if [[ "$url" =~ bitbucket\.org[:/]([^/]+)/([^/]+)$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
    return
  fi
  echo "open-pr: origin is not a Bitbucket repository." >&2
  exit 1
}

# The PR must point at a branch that exists on Bitbucket with this exact commit.
require_pushed() {
  local branch="$1" remote_sha local_sha
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git ls-remote origin "refs/heads/$branch" | cut -f1)"
  if [[ "$remote_sha" != "$local_sha" ]]; then
    echo "open-pr: push first — origin/$branch is not at HEAD ($local_sha). Run: git push origin $branch" >&2
    exit 1
  fi
}

# The team PR template.
write_description() {
  # "Refs", not "Closes": closing the issue stays human.
  printf '## Issue\nRefs #%s\n\n' "$ISSUE_NUMBER"
  # Tests first: the reviewer reads what each test protects (and does not prove) before the code.
  printf '## Tests (review these first)\n'
  cat "$TESTING_FILE"
  printf '\n## Summary\n'
  cat "$SUMMARY_FILE"
  printf '\n## Sonar\n'
  cat "$SONAR_FILE"
  if [[ "$SONAR_SKIPPED" == true ]] && ! grep -qi 'skipped' "$SONAR_FILE"; then
    printf "\n> Sonar analysis was skipped locally at the developer's request; the CI pipeline runs it.\n"
  fi
}

# Reads the text from stdin. Windows (Git Bash): PowerShell's Set-Clipboard,
# reading stdin as UTF-8 so accents and dashes survive (clip.exe garbles them).
# macOS: pbcopy. Linux: wl-copy or xclip.
copy_to_clipboard() {
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command       '[Console]::InputEncoding = [Text.UTF8Encoding]::new($false); Set-Clipboard -Value ([Console]::In.ReadToEnd())'       && return 0
    return 1
  fi
  if command -v pbcopy >/dev/null 2>&1; then pbcopy && return 0; fi
  if command -v wl-copy >/dev/null 2>&1; then wl-copy && return 0; fi
  if command -v xclip >/dev/null 2>&1; then xclip -selection clipboard && return 0; fi
  return 1
}

open_in_browser() {
  local url="$1"
  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$url" >/dev/null 2>&1 && return
  fi
  if command -v open >/dev/null 2>&1; then open "$url" && return; fi
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 && return; fi
  echo "open-pr: couldn't open a browser — use the link above."
}

main "$@"
