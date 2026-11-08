---
description: Turn a rough idea into a GitHub story issue (what and why) with its three-item checklist
---
Help me turn a rough idea into a story issue in the project's GitHub repo (repo and tag from the
project `CLAUDE.md` "GitHub repo" line). My first description of the idea may be in $ARGUMENTS. For
every GitHub issue read or write, follow the `github-issues` skill.

Start every reply with `/rdp:story · step N` (plus the issue number once it exists).

This command covers **what and why**: the problem and the expected outcome, never the implementation.

0. In 3–4 lines, say what will happen: we talk the idea through, you check the code, the docs and
   existing issues, show me a draft, and create it on GitHub only after my approval.
   If the RDP block is missing or differs from the template, say so in one line and suggest
   `/rdp:setup-repo`; then go on. If the repo or tag is missing, ask me for it.
1. Let me describe the idea in my own words (use $ARGUMENTS if given, otherwise ask).
2. Clarify it in conversation, **a few questions at a time, never a questionnaire**: the problem
   today, who is affected, why it matters, what "done" looks like, what is out of scope. Follow up on
   vague answers.
   **"Done" is the most important part of the story: the acceptance criteria come from it.** Ask it
   plainly and on its own ("How will we know it's finished?"), with no example answer. Then dig until
   each criterion is something you can check: the happy path, the errors and edge cases, the
   environment, and who does the final check.
3. Ground it, in parallel, so you understand the project and a bit of the code:
   - `explorer`: in at most ~150 plain words, no code: what the system does today in this area,
     the rules and validations it has, the error cases it handles, and the domain terms it uses.
   - `researcher`: the repo's `docs/` (its own format and limits).
   Use the domain's own words. If the code or docs contradict
   me, tell me and ask. Use the findings to describe the problem, not to design the solution.
4. Search the repo's issues for similar ones (`gh search issues` on the key terms; open and recently
   closed). Show number, title, state, and ask: go on, extend an existing issue, or stop.
5. Draft the story. **The whole description fits in 10–15 lines**, in plain words anyone on the
   team understands, business people included: no class names, endpoints, tables or jargon. If it
   doesn't fit, the story is too big: split it.
   - **Title**, starting with the project's tag (e.g. `[WebBroker] ...`).
   - **Problem and why it matters**. User-facing work: "As a [role], I want [capability], so that
     [benefit]"; technical work: a plain problem statement.
   - **Scope** and **Out of scope**.
   - **Acceptance criteria**, the heart of the story. Each one:
     - a concrete example with real values, in Given/When/Then;
     - observable from outside (what the user sees or the system does), never how it's built;
     - pass or fail, with no room for opinion ("fast", "easy", "works well" are not criteria);
     - covering the errors and edge cases, not only the happy path.
     The story is done when every criterion passes, and the Testes item checks them one by one.
     Criteria often change during implementation, when something new is learned. Then propose the
     change, and once the developer approves it, update the criteria and the Testes items in the
     issue together. There is always one Testes item: adjust it, never add another.
6. Check it against INVEST, one line each. Too big: suggest a split. If you can't say who benefits
   and why, or a criterion can't be checked, the story isn't ready: ask me, don't show a draft.
7. Show the draft, the INVEST check and the duplicates, with the settings, for one approval:
   - **Repo**: the one in `CLAUDE.md`, unless I say otherwise.
   - **Assignee**: me, someone else (GitHub login), or unassigned. Ask; no default.
   - **Epic**: the repo's open milestones (`gh api repos/<owner/repo>/milestones`), or none.
   - **Story points**: only a number I confirm; a suggestion only if I ask; empty if I say so.
   - **Backlog or current iteration**: ask; no default. (The iteration lives on the project board
     from the "GitHub mapping" table; with no board, say so and leave it in the backlog.)
   - **Checklist**, always these three items, each with a short plain description:
     - **Implementação**: "Implement the story so every acceptance criterion passes."
     - **Testes**: one sub-item per acceptance criterion (the criterion itself), then the test
       types: unit + integration in a modern project; in a legacy one (`Legacy: YES`), none
       required, so each criterion is checked by hand.
     - **Deploy**: HML, then PRD, in one item; for each, where the criteria are checked and who
       checks them (from the docs, or ask me).
   Iterate until I approve.
8. After approval, create the issue with `gh issue create`: the `story` label if the repo has one
   (`gh label list`), the title and text exactly as approved, the epic as `--milestone`, the assignee
   (`@me` or the login). Confirmed story points go in a `points:<n>` label if the repo has those
   labels, otherwise a `Story points: <n>` line in the body. The three items go at the end of the body
   as a `## Checklist` task list (`- [ ]`), never more than three. If I chose the current iteration,
   add the issue to the board and set its iteration. Read it back (`gh issue view`), check it matches
   what I approved, and give me the number.
9. End with: "Story created. Before you implement it, I recommend
   clearing the context (`/clear`), so the AI works at its peak; the story is on GitHub, nothing is
   lost."

INVEST, readiness and duplicates are your calls; `explorer` and `researcher` only find and report.
