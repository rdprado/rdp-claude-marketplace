# rdp-claude-marketplace

This repo is the RDP Claude Code plugin (`plugins/rdp/`), shipped through
the `rdp-claude-marketplace` marketplace (`.claude-plugin/marketplace.json`).

- Main rules for projects: the `rdp-mode` skill (`plugins/rdp/skills/rdp-mode/SKILL.md`); its table points to
  the other skills. Reference code: `plugins/rdp/templates/examples/orders/`.
- Project CLAUDE.md templates: `plugins/rdp/templates/claude-md/` — `legacy.md` (one file) and `modern/`
  (`base.md` plus one file per stack; the setup-repo menu picks them).
- On-demand rules: `plugins/rdp/skills/`. Commands: `plugins/rdp/commands/`.
  Agents: `plugins/rdp/agents/`.

After changing anything under `plugins/rdp/`, suggest bumping `version` in
`plugins/rdp/.claude-plugin/plugin.json`: without a new version, installs
don't get the change.

Tests: `node --test tests/hooks/*.test.mjs tests/scripts/*.test.mjs`.

Do not put task journals in project `CLAUDE.md` files. Task history goes in GitHub issues. Keep project `CLAUDE.md` short.

Each parallel agent gets one task. Never give one agent several tasks, so its context stays small and doesn't mix.
