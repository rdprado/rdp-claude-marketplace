---
description: Implement one or more Jira stories — in parallel, one branch and one PR each
---
Implement the Jira stor(ies) in $ARGUMENTS: one or more keys, e.g. `OMNI-1591` or
`OMNI-1591 OMNI-1636`. The story is the unit of work (like a GitHub issue): one branch, one
PR. Its three subtasks (Implementação, Testes, Deploy) are only its checklist, not separate
runs. With `--pair` I work one story step by step with you (see "Pair mode").

Until this command is finished, start every reply with one line naming where
we are, e.g. `/pnt:implement OMNI-1234 OMNI-1240 · verifying`.

Open with the line "Implementation mode: deliver" (or "pair") and the summary of step 0
on the lines below it.

0. Before anything else, show a 2–3 line summary of what will happen in this run, in the
   future tense: which stories, which repo(s), which run in parallel and which one after
   another (and why), and that you will come back with the PRs ready and ask for my OK once
   before anything is committed or pushed. Then ask if it's my first time using
   /pnt:implement. If yes, explain it in one short paragraph: "I implement each story on its
   own branch, run the checks, review the result and bring you a pull request per story.
   Stories that don't touch the same files run in parallel (`implementer` agents, each in its
   own worktree). `verifier` (Haiku) runs the checks and summarizes them; I decide what they
   mean. You review in the PR, tests first. Say `--pair` and we go step by step instead."
   Check the folder this session started in: the project CLAUDE.md that is loaded is that
   folder's, so if the repo you will change is a different one (catalog → clone), say so in one
   line and ask me to restart the session from that repo's folder (`cd <clone>` then `claude`).
   Don't start until I restart or tell you to go on from here.
   Ask "Run Sonar analysis? [Y/n]" once, for the whole run (default: run it). For
   config/docs-only stories say so and suggest skipping. Then stop and wait for my "go".
   Do nothing — no Jira change, no git command — before that.
0.5. Check the PnT standards, once: if the project's `CLAUDE.md` has no PnT
   block, suggest `/pnt:setup-repo` and go on. Otherwise compare
   `.claude/pnt-standards.md` and the PnT block with
   `${CLAUDE_PLUGIN_ROOT}/templates/`; if they differ, say "The PnT standards
   in this project are out of date", list the changes in a few lines and
   offer to update them (then they must be committed). If they match, say
   nothing.
1. Read each story from Jira (never from local files) and move it to the project's
   in-progress status (from `getTransitionsForJiraIssue` on the story; ask if none fits). If the story has the three standard subtasks, move Implementação to
   in-progress too; if it has other subtasks (older work), treat them as its checklist. Either
   way it is one PR for the story. If there is no ticket for the work, ask me whether to create
   one before naming a branch.
2. For each story, before writing code: catalog → local clone → `git fetch` → show branch and
   ahead/behind. Say in one line before touching anything: "I will work in <path>, on a new
   branch `feature/<KEY>-<short-description>` (see the `git-flow` skill) from
   `origin/<default>`." Keep it current: `git pull --ff-only` the default branch before
   branching; a new branch starts from the freshly fetched `origin/<default>`; an existing
   work branch is switched to, and if it is behind `origin/<default>` merge it in (rebase
   only if I ask; on conflicts stop and show me). If the clone has uncommitted changes or
   unpushed work, tell me and offer: commit it, stash it, or switch branch.
   - **Main tree first:** work in the repo's own clone unless a worktree clearly works
     better. Claude decides whether to create one (e.g. several stories at once on different
     files). Whenever it creates a worktree, it warns me first in one line: the reason, why the
     main tree would not do, and the path `.claude/tmp/wt-<KEY>`. If the main tree works as
     well, it uses that. Only stories that touch different files run at once; if two want the
     same files, run them one after the other and say so. A story spanning several repos gets
     one branch per repo.
   Tell me in two lines where to follow the work: the absolute path of each clone/worktree
   and the IDE to open (Visual Studio with the `.sln` for C# repos, VS Code otherwise).
3. Implement each story.
   - Read the guidelines first: the story's own, plus the skills from the table in
     `.claude/pnt-standards.md` that match the work (`testing` for any test, `git-flow` before
     any branch/commit/push).
   - Before coding, if the story leaves something open that blocks the work, ask me **one
     question at a time**, saying in one line what each answer changes; what I can't answer
     goes into the plan as a risk with an owner. If docs and code disagree, flag it instead of
     trusting the docs.
   - **Big or uncertain stories** (more than one repo, legacy code, the order path, unknown
     code, open questions): map the code with `explorer` and the docs with `researcher` first,
     write a plan of at most 10 lines (approach, test strategy, what the tests do not prove,
     risks), send it to `architect` with the story's goal, scope and out of scope, show me what
     it suggests (one line each) and wait for my OK before applying any of it, then post the
     plan as a comment on the story. Small stories skip this.
   - Tests: each one traces to a goal or acceptance criterion and says what it protects;
     never test another repo's or a package's code. When the work must keep an existing
     environment working, compare the old build's behavior with the new code's (changed
     defaults, values that moved from code to config), and write down what the tests do not
     prove. Break the result on purpose at least once to see the right test fail.
   - One story: implement it yourself in the main session. Several: one `implementer` per
     story, in parallel, each with a complete, self-contained instruction (the story text,
     the guidelines, the worktree path, the files it owns and must not touch). You check what
     each one wrote against the guidelines before moving on.
   - **Something new comes up** (outside the story's scope): say in one line what it is and
     propose doing it in parallel. If it fits an open story, add it there; otherwise create a
     new story by running `/pnt:story` for it (in the background; it creates the story with its
     three subtasks), and, if it is small and touches other files, implement it
     at once on its own branch and worktree and bring its PR too. Never grow the current
     story with it. Never parallelize jobs that touch the same files.
   - **Stories added mid-run:** I may give you more keys at any time ("add OMNI-1700"), or
     stories created during the run may be added: start each one right away through steps 1–3
     (in parallel if it touches other files, otherwise after the one that owns those files, and
     say which), and include it in the report of step 7 with the others. No new `/pnt:implement`
     needed.
4. Verify, one `verifier` per story, in parallel. Pass it my Sonar answer from step 0 ("skip
   Sonar" only if I said no). If a failure persists after two fix attempts, call `debugger`.
   If the repo has no `ci/verify.sh`, say so and ask right then: "Create a story for
   ci/verify.sh? [Y/n]"; meanwhile run the build and tests directly. Run the full
   `ci/verify.sh` at the end (lint, build, unit, Sonar with quality gate, integration). If Sonar
   runs and is not configured, stop and show me the setup message. Blocking: a failed non-Sonar
   gate, a Sonar issue that is new from this work, a failing gate condition the project
   CLAUDE.md does not list as known debt — fix those first. Pre-existing debt: show me the
   list and ask what to do, never fix or ignore it on your own.
5. Review. For production code, send each final diff to `architect` with the story's goal,
   scope and out of scope, and tell it to review only what the story put into the code. Skip
   it for config/docs-only changes unless I ask. Show me what it suggests, one line each (what,
   why, which file), and wait for my OK before applying any of it. Then check every acceptance
   criterion and say which are met.
6. Before committing, per story: `git fetch` and confirm the branch is up to date with
   `origin/<default>` (if behind, tell me and ask before merging); check `git status` for new
   files the `.gitignore` swallowed; if the pipeline has a version gate on pull requests
   (e.g. `ci/version-gate.sh`), run it locally and, if it would fail, say so and propose the
   version bump.
7. Come back with one report for all stories, then ask my OK **once**: "Commit and push these
   N?". Per story: what changed (2 lines), **the tests first** (what each protects, what they
   do not prove, what I broke on purpose), the verify result, the architect's suggestions and
   what was applied, the branch and worktree path. I review the tests first, then the code.
8. After my OK, **you (the main session, not a subagent)** commit and push each branch (see the
   `git-flow` skill) and prepare each PR with `${CLAUDE_PLUGIN_ROOT}/templates/ci/open-pr.sh`:
   write the summary, testing and Sonar sections to files in .claude/tmp/ and pass them in;
   keep them SHORT (summary up to 4 lines — what and why, never a file list; testing up to 3
   lines, naming what the key tests protect and what they don't prove; Sonar 1 line); add
   `--sonar-skipped` if Sonar was skipped, and the PR description must then say: "Sonar analysis
   was skipped locally at the developer's request; the CI pipeline runs it." There are no
   Bitbucket tools, so I create each PR in the browser: show me every title and link together
   and wait for me to paste back the PR URLs. Then post a summary comment on each story (what
   changed, how it was tested, Sonar result condition by condition, pre-existing debt I chose
   to leave, PR link) and keep it in the in-progress status. If the story has the standard
   subtasks: Implementação goes to done once the PR is created, Testes goes to done when its
   checklist (the test types that exist) has run green, and Deploy stays open until the
   delivery. Delete the drafts in .claude/tmp/.
9. Stop and wait. Only after I confirm a PR was approved, move that story to the project's
   ready-for-test status (a single transition: do it directly). Remove its worktree once the
   branch is pushed.
10. If the Confluence catalog shows no intro for this project, offer to draft one from what was
    learned, following "Modelo de Página de Projeto (Padrão)", plus the catalog entry if it's
    missing. Only if I accept: write the draft to .claude/tmp/confluence-intro-<project>.md and
    show it to me; publish to PI1 (as `Intro - <Projeto>`, and set the catalog entry's `Intro:`
    line) only after my explicit approval. The intro covers what the system is and how it
    relates to other projects — not how to work in the code (that stays in CLAUDE.md).

## Pair mode (`--pair`)

One story, step by step, no `implementer`. Same steps 0–2, then:
a. Show me the plan (files, approach, tests, with "Guidelines I will follow:") and wait for my OK.
b. Implement it yourself, checking what you wrote against the guidelines first.
c. Run `verifier` (ask about Sonar before each run), then walk me through the changes **one file
   at a time**: full path, the diff against the reference, the verify result, one or two
   sentences on why; wait for my "ok" on each file. Remind me I can ask "why?" at any time.
d. Apply my feedback. Then steps 5–10, with my OK asked before the commit as in step 7.
In pair mode, suggest the model for the story in step 0 with a one-line reason, and tell me to
switch with `/model <name>` before "go" if it differs from this session's: **Sonnet** for a
clear, well-specified story; **Opus** when it needs judgment (legacy code, the order path,
money/state consequences, decisions still being made).

Status names come from Jira (`getTransitionsForJiraIssue` on the story), never from memory.
If none matches, ask me.
