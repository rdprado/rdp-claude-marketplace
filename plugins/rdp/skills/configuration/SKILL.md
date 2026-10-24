---
name: configuration
description: RDP rules for .NET appsettings*.json, environments and secrets in config. Use when adding or changing configuration keys or environments.
---
# Configuration (.NET)

How .NET projects ship `appsettings*.json`. Read when adding or changing configuration keys, environments, or secrets in config.

Ship one per-environment file alongside the local-dev base:

- `appsettings.json` — local-dev defaults; never shipped to a server.
- `appsettings.HML.json` — full HML config.
- `appsettings.PRD.json` — full PRD config.

Add more (e.g. `appsettings.DEV.json`) only if the project actually has another deployed environment — don't invent envs that don't exist on a host somewhere.

Each per-env file is self-contained (no merge between them). The deploy pipeline picks the right one and renames it to `appsettings.json` on the target box — see the `pipelines` skill.

Secret keys in committed files are always `""` placeholders. Real values come from the host's systemd `EnvironmentFile`. No comments in any `appsettings*.json` — keep them pure JSON.
