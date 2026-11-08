---
description: Quick guide to the RDP commands, the order to use them, and where things live
---
Print the text below exactly as written (the card goes in one code block).
Don't add anything before it. After it, check the RDP block once: if the
project's `CLAUDE.md` has no RDP block, suggest `/rdp:setup-repo`; otherwise compare
the RDP block with `${CLAUDE_PLUGIN_ROOT}/templates/claude-md/` and, if it differs or the
project still has an old `.claude/rdp-standards.md`, say "The RDP block in this project is
out of date" and offer to update it (then it must be committed). Then ask in one line if I want more detail on any command.

`/rdp:help`

```
░     │ ▄▀▓ █
░ RDP │ ▒▀▓ █

┌─ Commands, in order ───────────────────────────────────────────────┐
│                                                                    │
│ 0  /rdp:setup-repo         once per project: helps you write or    │
│                            update CLAUDE.md with the RDP AI        │
│                            standards                               │
│                                                                    │
│ 1  /rdp:story              rough idea → GitHub issue with its      │
│                            three-item checklist (Implementação,    │
│                            Testes, Deploy)                         │
│                                                                    │
│ 2  /rdp:pickup <#n>        start an issue: assignee, in progress,  │
│                            branch (or SVN revision), comment       │
│                                                                    │
│ 3  /rdp:wrap <#n>          after the PR: review status, PR link,   │
│                            summary comment (never closes it)       │
│                                                                    │
├─ How it flows ─────────────────────────────────────────────────────┤
│                                                                    │
│ idea → /rdp:story → GitHub issue with its three-item checklist,    │
│        you approve it → /rdp:pickup                                │
│ → you implement it with the AI (the skills load on their own) →    │
│        before each push the docs are checked (update-docs) → PR    │
│ → /rdp:wrap                                                        │
│                                                                    │
│ At any step you can say: approve, why?, stop                       │
├─ Where things live ────────────────────────────────────────────────┤
│                                                                    │
│ Tasks, plans, status    →  GitHub issues (titles start with [tag]) │
│ Docs                    →  the repo's docs/ folder                 │
│ AI standards            →  rdp plugin (rdp-claude-marketplace)     │
│ Project specifics       →  project CLAUDE.md (refers to the        │
│                            AI standards)                           │
└────────────────────────────────────────────────────────────────────┘
```
