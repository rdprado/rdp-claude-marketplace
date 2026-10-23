# pnt-claude-marketplace

This repo is the PnT Claude Code plugin (`plugins/pnt/`), shipped through
the `pnt-claude-marketplace` marketplace (`.claude-plugin/marketplace.json`).

- Always-on rules for projects: `plugins/pnt/templates/pnt-standards.md`
  (copied into each project by /pnt:setup-repo, refreshed by the check at the start of every PnT command).
- Project CLAUDE.md templates: `plugins/pnt/templates/CLAUDE.project.md`
  and `CLAUDE.legacy.md`.
- On-demand rules: `plugins/pnt/skills/`. Commands: `plugins/pnt/commands/`.
  Agents: `plugins/pnt/agents/`.

After changing anything under `plugins/pnt/`, suggest bumping `version` in
`plugins/pnt/.claude-plugin/plugin.json`: without a new version, installs
don't get the change.

Do not put task journals in project `CLAUDE.md` files. Task history goes in Jira cards. Keep project `CLAUDE.md` short.

Each parallel agent gets one task. Never give one agent several tasks, so its context stays small and doesn't mix.
