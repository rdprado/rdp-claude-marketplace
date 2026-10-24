---
name: git-flow
description: RDP branching, commit and pull request rules (git and SVN). Use when committing, branching or opening a PR.
---
# Git flow

Reference standards for branching, commits, and pull requests.

**Each project uses one flow, declared in its `CLAUDE.md` ("Git flow: A" or "Git flow: B").** If the project `CLAUDE.md` doesn't say, ask the developer before branching — don't pick one. Flow A is for projects that ship parallel versioned releases (e.g. supporting `3.11.x` and `3.13.x` at the same time); Flow B otherwise. The sections after the two flows apply to both.

<!-- =================================================================== -->
<!-- Flow A — Release-branch flow                                        -->
<!-- =================================================================== -->

## Flow A — Release-branch flow

- **`main`** — production. Release branches merge here when a release is done.
- **`release/X.Y.x`** — long-lived per release cycle (e.g. `release/3.13.x`).
- **`feature/<ISSUE-NUMBER>-<short-description>`** — branched from a specific `release/X.Y.x`. When creating one, ask which release branch to base it on.
- **`hotfix/<ISSUE-NUMBER>-<short-description>`** — branched from `main` for urgent production fixes.

PR targets:

- feature → its `release/X.Y.x` branch.
- release → `main`.
- hotfix → `main`.

<!-- =================================================================== -->
<!-- Flow B — GitHub Flow                                               -->
<!-- =================================================================== -->

## Flow B — GitHub Flow

- **`main`** — always deployable. Production runs from `main`. Only long-lived branch.
- **`feature/<ISSUE-NUMBER>-<short-description>`** — short-lived, branched from `main`.
- **`fix/<ISSUE-NUMBER>-<short-description>`** — same as feature, for bugs.
- **`hotfix/<ISSUE-NUMBER>-<short-description>`** — urgent prod fix, branched from and merged back to `main`.

Merge feature/fix branches into `main`. Delete the branch after merge.

<!-- =================================================================== -->
<!-- End flow blocks — sections below apply to either flow.              -->
<!-- =================================================================== -->

## Branch names and GitHub issues

Every branch name carries the GitHub issue number, e.g. `feature/1234-order-status-webhook`. GitHub links commits and PRs to the issue by `#1234` in their text — `/rdp:implement` relies on it. For work without an issue, ask whether to create one before branching.

## Pushing and opening PRs (Bitbucket)

- Push: always `git push origin <branch>`. Never bare `git push`.
- There's no `gh` equivalent, and the claude.ai Atlassian connector has no Bitbucket tools. Prepare PRs with **`${CLAUDE_PLUGIN_ROOT}/templates/ci/open-pr.sh`** (in the `rdp` plugin): it fills the team template, copies the description to the clipboard and prints the "create PR" link — you create the PR in the browser. No token needed. Never put Bitbucket credentials inline or in a repo.
- Put the issue number at the start of the PR title: `#1234: add order status webhook`.

## Commits

- Small commits, in order, one logical change each. Each says why, what changed, and how it was checked.
- Format: `<type>: <subject>` — types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Subject: imperative mood, no trailing period.
  - Good: `feat: #1234 add order status webhook handler`
  - Bad: `Added a new handler for the order status webhook`
- Body (optional): wrap at 72 chars. Explain *why*, not what.
- Put the issue number in the subject, after the type: `feat: #1234 add order status webhook handler`. GitHub links the commit to the issue by that number.

## Pull requests

When a work is complete suggest opening one or multiple PRs. Ideally a PR should be less than ~1000 lines.

## Code review

- At least one approval before merge.
- Reviewer: catch bugs, suggest simpler approaches, flag missing tests. Not style — formatter handles that.
- Author: respond to every comment; resolve only when addressed or agreed.

## Don't

- Don't commit directly to `main` (or to a `release/X.Y.x` branch under Flow A).
- Don't `git push --force` to anything but your own feature branch — and prefer `--force-with-lease`.
- Don't merge a PR with failing CI.
- Don't skip review with "tiny fix" — open a PR.
