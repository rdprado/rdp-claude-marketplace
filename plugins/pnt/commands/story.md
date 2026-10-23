---
description: Turn a rough idea into a Jira story (what and why) with its three subtasks — /pnt:implement does the how
---
Help me turn a rough idea into a Jira story in the project's Jira (project key
from the project CLAUDE.md "Jira project" line; OMNI for the pilot). My
first description of the idea may be in $ARGUMENTS.

Until this command is finished, start every reply with one line naming where
we are, e.g. `/pnt:story · step 2` (add the story key once it exists).

This command covers **what and why**. The technical solution belongs to
/pnt:implement — describe the problem and the expected outcome, never the
implementation.

0. Before anything else, show a 3–4 line summary of what will happen (we talk
   the idea through, you check the code, Confluence and existing tickets, show
   me a draft, and create it in Jira only after my approval) and ask if it's my
   first time using /pnt:story. If yes, explain in more detail — what you'll
   ask, what a good story needs, and what I can say ("that's out of scope",
   "split it", "approve") — before starting.
0.5. Check the PnT standards, once, before the idea talk:
   - If the project's `CLAUDE.md` has no PnT block, suggest `/pnt:setup-repo`
     and go on.
   - Otherwise compare `.claude/pnt-standards.md` and the PnT block with
     `${CLAUDE_PLUGIN_ROOT}/templates/`. If they differ, say "The PnT
     standards in this project are out of date", list the changes in a few
     lines and offer to update them (then they must be committed).
   - This command needs the "Jira project" line and the project tag; if
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
   today and the terms used there; `researcher` for the project's Confluence
   intro and related pages. Use the domain's own terms — the same words the
   code and the business use. If the code or docs contradict what I said, tell
   me and ask. Use the findings to describe the problem accurately, not to
   design the solution.
4. Search the project's Jira for similar existing tickets (JQL text search on
   the key terms; open ones and recently done ones). Show me what you found —
   key, summary, status — **before creating anything**, and ask whether to go
   on, extend an existing ticket instead, or stop.
5. Draft the story:
   - **Title** — starts with the project's tag from the project CLAUDE.md
     "Jira project" line (e.g. `[WebBroker] ...`); ask if it has none
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
   - **Project/board** — default: the project in the project CLAUDE.md "Jira
     project" line (OMNI for the pilot); ask if it should go elsewhere.
   - **Assignee** — me, someone else (who?), or unassigned; ask; no default.
   - **Epic** — does it belong to one? Offer the project's open epics (JQL:
     issuetype = Epic AND statusCategory != Done) or none.
   - **Story points** — set now? If yes, how many? If I ask for a suggestion,
     give a rough estimate with a one-line justification — but never set
     points I haven't confirmed. If I say to leave it, leave it empty (the
     team may estimate in planning).
   - **Backlog or current sprint?** — always ask; no default.
   - **Subtasks** — always the same three, shown here so I approve them with the story:
     Implementação; Testes, as a checklist of only the test types this project has
     (unit, integration, contract, end-to-end — read them from the project CLAUDE.md
     "Testing" section; never invent a level it doesn't have); Deploy (HML and PRD in one).
   **Never assume a sprint or an assignee.** Iterate until I approve the draft and
   the settings.
8. After my approval:
   - Resolve the assignee's account ID yourself (me: `atlassianUserInfo`;
     someone else: `lookupJiraAccountId`), then write the approved draft and
     settings to .claude/tmp/story-<short-name>.md.
   - Use `jira-writer` to create the story (new-story case) **in the backlog**
     with the project, epic (as `parent`) and assignee. Confirm the read-back
     matches and delete the draft file.
   - Right after the story exists, use `jira-writer` again to create its three subtasks
     (Implementação, Testes, Deploy) as sub-tasks of it, each with a short description
     pointing back to the acceptance criteria. Read them back. Never create more than these
     three.
   - If I confirmed story points, set them yourself with `editJiraIssue` on
     the story-points field: find the field named "Story Points" in an issue of the
     project (`getJiraIssue` with `fields: ["*all"]` and `expand: "names"`) and use its ID.
   - If I chose the current sprint, move the story into it (how: next step to define).
     If I chose the backlog, leave it there.
   - Give me the key — ready for `/pnt:implement <KEY>`.

The judgment calls — INVEST, readiness, whether a ticket is a duplicate — are
yours (the main session), not the subagents'. `explorer` and `researcher`
only find and report.
