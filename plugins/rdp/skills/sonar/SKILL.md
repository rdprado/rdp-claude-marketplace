---
name: sonar
description: How RDP runs Sonar locally on .NET projects and reports the result; also its setup on a machine and a project. Use in Make it Right for .NET code, when setting up a project, or when reading a Sonar result.
---
# Sonar

Local Sonar for .NET, with no `ci/` files: `node "${CLAUDE_PLUGIN_ROOT}/scripts/sonar-local.mjs"`. CI is the
`pipelines` skill. TypeScript uses crapper, mutator and dryer instead (`rdp-mode`).

## Our server

- SonarQube Community Build, MQR Mode. **No branch analysis**, so a local run goes to a project of its own,
  `<official-key>-local-<dev>`, never the official one, and "new from this work" comes from `git diff`.
  The script does both, and gives the local project the official one's quality gate and profiles.
- CI reads the official project's issues with `inNewCodePeriod=true&issueStatuses=OPEN,CONFIRMED`; without
  `issueStatuses`, issues fixed by an earlier run look open.
- Group issues by `impacts` (`SECURITY`/`RELIABILITY`/`MAINTAINABILITY` × `BLOCKER`…`INFO`), never by the
  legacy `type`/`severity`.

## Ready to run

In this order:

1. **The project key**, from the project's `CLAUDE.md` → "Sonar". If it is missing, ask in chat, one question:
   - the project already exists on Sonar → the developer gives its key;
   - it doesn't, and the project will go to production → recommend asking the Sonar admin for an official
     project and its pipeline; until then the developer picks the key (local runs use the server's default gate);
   - an experiment that will never ship → `none`: stop here, nothing to install.

   Write only the key the developer typed or chose; never take one from a URL, a folder name or a guess.
2. **The machine**: `sonar-local.mjs check <key>` lists what is missing, each with the command that fixes it.
   - Java 17+ and `dotnet-sonarscanner`: run the printed command, after asking.
   - Sonar URL and token: run the printed `setup` command. It opens a file in Notepad that tells the developer
     where to get both. Show its output as it is, adding nothing. On "done", run `setup` again.
     Never open, read or search `sonar-setup.txt` or `sonar.json`: the token is in them.
     Never ask for the token in chat, never read or print it, never set `SONAR_TOKEN` yourself.
3. **`check <key>` again**: "ready", and whether the key exists on the server. If it doesn't, say so and ask
   whether the key is right.

## Running

From the project root, before committing a .NET change in Make it Right:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/sonar-local.mjs" <official-key> [--solution <file>] [--base <branch>]
```

It runs `check`, then begin → build → tests with coverage → end, and writes `.sonarqube/report/`
(gitignore `.sonarqube/`). Exit 0: gate OK. Exit 1: gate failed, or something to fix (the message says what).

## Reporting

Short, no raw JSON:

1. The gate, every condition (metric, comparator, threshold, actual). The local gate is a guide; CI on the
   official project decides.
2. **New from this work**: the full list the script printed. These are yours to fix.
3. **Pre-existing debt**: counts only. Don't fix or dismiss it without the developer's decision.

Log the run in `.claude/tmp/log-<task>.md`: when, the gate, the new issues and what you did with each.
