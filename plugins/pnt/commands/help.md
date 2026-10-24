---
description: Quick guide to the PnT commands, the order to use them, and where things live
---
Print the text below exactly as written (the card goes in one code block).
Don't add anything before it. After it, check the PnT standards once: if the
project's `CLAUDE.md` has no PnT block, suggest `/pnt:setup-repo`; otherwise compare
`.claude/pnt-standards.md` and the PnT block with
`${CLAUDE_PLUGIN_ROOT}/templates/` and, if they differ, say "The PnT standards
in this project are out of date" and offer to update them (then they must be
committed). Then ask in one line if I want more detail on any command.

`/pnt:help`

```
░ PLUG       │ ▄▀▓ █
░ AND TRADE  │ ▒▀▓ █

┌─ Commands, in order ───────────────────────────────────────────────┐
│                                                                    │
│ 0  /pnt:setup-repo              once per project: helps you write or    │
│                            update CLAUDE.md with the PnT AI        │
│                            standards                               │
│                                                                    │
│ 1  /pnt:story              rough idea → GitHub issue with its      │
│                            three-item checklist (Implementação,    │
│                            Testes, Deploy)                         │
│                                                                    │
│ 2  /pnt:implement <#n>...  implement one or more stories in        │
│                            parallel, one PR each (--pair = step    │
│                            by step)                                │
│                                                                    │
├─ How it flows ─────────────────────────────────────────────────────┤
│                                                                    │
│ idea → /pnt:story → GitHub issue with its three-item checklist,    │
│        you approve it                                              │
│ → /pnt:implement → one PR per story, tests first, one OK before    │
│        anything is committed or pushed                             │
│ → you approve the PR → the issue gets the ready-for-test label     │
│                                                                    │
│ At any step you can say: approve, why?, stop, skip Sonar this time │
├─ Where things live ────────────────────────────────────────────────┤
│                                                                    │
│ Tasks, plans, status    →  GitHub issues (titles start with [tag]) │
│ Docs                    →  the repo's docs/ folder                 │
│ AI standards            →  pnt plugin (pnt-claude-marketplace)     │
│ Project specifics       →  project CLAUDE.md (refers to the        │
│                            AI standards)                           │
└────────────────────────────────────────────────────────────────────┘
```
