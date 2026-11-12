---
description: Wrap up a GitHub issue once its PR is open (or the developer committed, in SVN) — status, link, summary comment
argument-hint: <#ISSUE>
---
Issue: $ARGUMENTS. The final tidy-up; comments and status changes should already have happened
during the work. Follow the `github-issues` skill ("Working an issue").

1. Check the PR is open (git), or that I committed (SVN: ask me the revision). This command opens
   nothing and never runs `svn commit`.
2. Mark $ARGUMENTS as in review: the board's review status, or swap the in-progress label for the
   repo's review label (neither: skip silently). **Never** close it: closing stays human.
3. Link the PR. If the PR already says `Refs #<n>` (GitHub then lists it on the issue), don't add a
   duplicate link. SVN: reference the revision.
4. Comment `Progress:` with a short summary of what was done and the PR link (or revision).
5. Ask me whether the issue now reflects reality before ending.
