---
description: Turn a rough idea into a GitHub story issue (what and why) with its three-item checklist — /rdp:implement does the how
---
Help me turn a rough idea into a story issue in the project's GitHub repo (repo
from the project CLAUDE.md "GitHub repo" line). My first description of the idea
may be in $ARGUMENTS. For every GitHub issue read or write, follow the `github-issues` skill.

Until this command is finished, start every reply with one line naming where
we are, e.g. `/rdp:story · step 2` (add the issue number once it exists).

This command covers **what and why**. The technical solution belongs to
/rdp:implement — describe the problem and the expected outcome, never the
implementation.

0. Before anything else, show a 3–4 line summary of what will happen (we talk
   the idea through, you check the code, the docs and existing issues, show
   me a draft, and create it on GitHub only after my approval) and ask if it's my
   first time using /rdp:story. If yes, explain in more detail — what you'll
   ask, what a good story needs, and what I can say ("that's out of scope",
   "split it", "approve") — before starting.
0.5. Check the RDP standards, once, before the idea talk:
   - If the project's `CLAUDE.md` has no RDP block, suggest `/rdp:setup-repo`
     and go on.
   - Otherwise compare `.claude/rdp-standards.md` and the RDP block with
     `${CLAUDE_PLUGIN_ROOT}/templates/`. If they differ, say "The RDP
     standards in this project are out of date", list the changes in a few
     lines and offer to update them (then they must be committed).
   - This command needs the "GitHub repo" line and the project tag; if
     either is missing, ask me for it and offer to add it.
   If everything is in order, say nothing and move on.
1. Let me describe the idea in my own words, however rough (use $ARGUMENTS if
   given, otherwise ask).
2. Clarify it in conversation — **a few questions at a time, never a
   questionnaire**. Over the conversation, cover: what the problem is today,
   who is affected, why it matters, what "done" looks like, and what is out of
   scope. Follow up on vague answers. This conversation is the core of the
   story.
   When it's time for "done", ask it plainly, on its own, e.g.: "Ok, now it's
   time for you to tell me the DONE CRITERIA for this story: how will we know
   it's finished?" Don't offer an example answer or bundle other questions
   with it. Let me answer freely; ask a follow-up only if something important
   is missing, such as the environment or who does the final check.
3. Ground it, in parallel: `explorer` to find where this lives in the code
   today and the terms used there; `researcher` for the project's docs
   intro and related pages. Use the domain's own terms — the same words the
   code and the business use. If the code or docs contradict what I said, tell
   me and ask. Use the findings to describe the problem accurately, not to
   design the solution.
4. Search the project's GitHub issues for similar existing ones (`gh search issues`
   text search on the key terms; open ones and recently closed ones). Show me what
   you found — number, title, state — **before creating anything**, and ask whether
   to go on, extend an existing issue instead, or stop.
5. Draft the story:
   - **Title** — starts with the project's tag from the project CLAUDE.md
     "GitHub repo" line (e.g. `[WebBroker] ...`); ask if it has none
   - **Problem and why it matters**
   - For user-facing work: "As a [role], I want [capability], so that
     [benefit]". For technical work: a clear problem statement instead —
     don't force the user-story template.
   - **Scope**
   - **Out of scope**
   - **Acceptance criteria** as concrete examples, in Given/When/Then where it
     helps.
6. Before showing the draft, check it against **INVEST** (independent,
   negotiable, valuable, estimable, small, testable), one line each. If it's
   too big, suggest how to split it into smaller stories. If you can't state
   who benefits and why, say the story isn't ready and ask me — don't show a
   draft yet.
7. Show me the draft, the INVEST check and the duplicates found, **together
   with the creation settings**, so I approve everything at once:
   - **Repo** — default: the repo in the project CLAUDE.md "GitHub repo"
     line; ask if it should go elsewhere.
   - **Assignee** — me, someone else (who?), or unassigned; ask; no default.
   - **Epic** — does it belong to one? Offer the repo's open milestones
     (`gh api repos/<owner/repo>/milestones`) or none.
   - **Story points** — set now? If yes, how many? If I ask for a suggestion,
     give a rough estimate with a one-line justification — but never set
     points I haven't confirmed. If I say to leave it, leave it empty (the
     team may estimate in planning).
   - **Backlog or current iteration?** — always ask; no default. (The current
     iteration lives on the repo's project board from the "GitHub mapping"
     table; with no board, say so and leave it in the backlog.)
   - **Checklist** — always the same three items, shown here so I approve them with the story:
     Implementação; Testes, as a sub-checklist of only the test types this project has
     (unit, integration, contract, end-to-end — read them from the project CLAUDE.md
     "Testing" section; never invent a level it doesn't have); Deploy (HML and PRD in one).
   **Never assume an iteration or an assignee.** Iterate until I approve the draft and
   the settings.
8. After my approval, create everything on GitHub yourself (`gh` CLI):
   - Assignee: me with `@me`; someone else by their GitHub login.
   - Create the issue with `gh issue create`: the `story` label if the repo has one
     (`gh label list`), the approved title and text exactly as approved, the epic as
     `--milestone`, and the assignee. If I confirmed story points, add them as a
     `points:<n>` label if the repo has those labels, otherwise as a `Story points: <n>`
     line in the body.
   - Put the three checklist items (Implementação, Testes, Deploy) at the end of the body
     as a `## Checklist` task list (`- [ ]`), each with a short note pointing back to the
     acceptance criteria. Never more than these three.
   - Read everything back (`gh issue view`) and check it matches what I approved.
   - If I chose the current iteration, add the issue to the project board and set its
     iteration (how: next step to define). If I chose the backlog, leave it there.
   - Give me the number — ready for `/rdp:implement <#n>`.

The judgment calls — INVEST, readiness, whether an issue is a duplicate — are
yours (the main session), not the subagents'. `explorer` and `researcher`
only find and report.
