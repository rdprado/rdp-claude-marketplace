---
name: configuration
description: RDP rules for appsettings*.json in .NET and in a TypeScript BFF, environments and secrets in config. Use when adding or changing configuration keys or environments.
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

## BFF (TypeScript)

The same convention, in `web/config/`: `appsettings.json` (local), `appsettings.HML.json`,
`appsettings.PRD.json`, chosen by `APP_ENV` (unset = local). Environment variables override single keys
with .NET's `__` form (`Session__Secret`, `Api__Url`): that's how secrets arrive, today from the host's
`EnvironmentFile`, later from the cloud secret store, with no code change. One server-only module reads
the file and the overrides and checks every key at startup.

- Secrets are `""` in HML/PRD. The local file may hold a visibly fake value (e.g. `Session.Secret`
  `"local-dev-only-change-me-not-a-real-secret-0000"`) so the app runs with no setup; outside local the
  BFF refuses to start when a secret is empty or equals that value.
- Nothing from these files reaches the browser bundle.
