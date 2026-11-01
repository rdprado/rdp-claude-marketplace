# rdp-claude-marketplace

Personal Claude Code marketplace with two plugins, copied from the PnT marketplace:

- `rdp` — AI standards, the `/rdp:*` commands, agents and skills.
- `rdp-mod` — a band above the prompt with the context size and what the last prompt spent per agent.

## Install

```
/plugin marketplace add https://github.com/rdprado/rdp-claude-marketplace.git
/plugin install rdp@rdp-claude-marketplace
/plugin install rdp-mod@rdp-claude-marketplace
```

Then run `/rdp:setup-repo` in a project.
