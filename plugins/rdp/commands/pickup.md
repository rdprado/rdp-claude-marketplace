---
description: Pick up a GitHub issue — read it, check the assignee, mark it in progress, start a branch
argument-hint: <#ISSUE>
---
Issue: $ARGUMENTS. No issue yet? Don't run this: describe the work, and `github-issues` →
"Starting without an issue" finds or creates one, then follows these same steps.

Follow the `github-issues` skill ("Working an issue" and "Description"):

1. Read $ARGUMENTS with its comments (`gh issue view <n> --comments`), and the `docs/` pages linked to it.
2. Assignee gate. Someone else's issue: stop here.
3. Mark it in progress: the board's in-progress status if the repo has a project board (from the
   `## GitHub mapping` table), otherwise the repo's in-progress label (from `gh label list`; ask if
   none fits).
4. VCS. Git: create the branch as the `git-flow` skill names it (`feature/<n>-<short-description>`).
   SVN: no branch; note the current revision.
5. Comment `Progress: Starting work, branch <branch>` (git) or `Progress: Starting work, rev <N>`
   (SVN).
6. Summarize the issue for me, and say which fields are missing (milestone, iteration, description,
   `needs-description` label).
7. Description gate: if it is empty, fill it (from a real comment or from my answer, draft,
   approve, write) before any code change. Wait for my answer, or for me to say explicitly to skip it.
