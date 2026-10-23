---
description: Once per project — helps you write or update CLAUDE.md with the PnT AI standards
---
Set up this project with the PnT AI standards.

0. Print the text below first, exactly as written, in a code block, then a
   blank line:

   ```
   ░ PLUG       │ ▄▀▓ █
   ░ AND TRADE  │ ▒▀▓ █
   ```

1. Ask: "Is <current folder> the project you want to set up?" If not, say:
   "Go to the project's folder, start Claude there and run /pnt:setup-repo
   again." and stop.
   If the project's `CLAUDE.md` already has the PnT block, it is set up:
   only check the PnT standards (compare `.claude/pnt-standards.md` and the
   PnT block with `${CLAUDE_PLUGIN_ROOT}/templates/`). If they differ, say
   "The PnT standards in this project are out of date", list the changes
   in a few lines, and offer to update them (then they must be committed).
   Either way, stop there.
2. Ask, one at a time, and always give a suggestion the developer can accept
   or change:
   - Modern or legacy. Modern is the default; legacy is the exception. Explain in one
     line: modern = .NET (Core / 5+) or TypeScript apps that follow clean architecture;
     legacy = old code with no clean architecture and little test coverage, e.g. .NET
     Framework 4.x, WinForms, old ASP.NET. Say what the project files show
     (`TargetFramework` in `.csproj`: `net8.0` and newer → modern, `net4x` → legacy).
     Always end with: "Can I go on with a modern project? (y/n)". `y` = modern,
     `n` = legacy. If the files point to legacy, say so before the question, so the
     developer can answer `n`. If the folder has no project files yet, say it is a new
     project, and a new project is modern.
   - Stack: .NET, TypeScript/JavaScript, or both. Detect it (`.csproj` → .NET;
     `tsconfig.json` or `package.json` → TypeScript/JavaScript) and say what you found.
     If the folder has no project files yet, ask.
   - Jira project key. Use the `claude.ai Atlassian MCP` server: call
     `mcp__claude_ai_Atlassian_MCP__executeRead` with `name: "listJiraProjects"`,
     `cloudId` (top-level) and `inputs: {}`. Call it directly, without `discover`.
     Show the key and name of every project and let me pick. Never use
     `getVisibleJiraProjects` (other server): it returns avatars and is about 40 times
     larger. If the server is not connected, ask me for the key.
   - Tag (e.g. `[WebBroker]`): the prefix of every issue title in that Jira
     project. Suggest it from the folder name, in the same form as the key's
     project name.
3. If the project has no `CLAUDE.md`: copy
   `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.legacy.md` (legacy) or
   `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.project.md` (not legacy) to the
   project root as `CLAUDE.md`, filling in the Jira key and the tag.
   If it already has one: never overwrite it. Compare it with the matching
   template and show me what's missing (the PnT block, Project profile
   lines, ...). Add only what I approve: the PnT block at the
   top, missing sections below it, leaving everything already there
   untouched. If something there contradicts the PnT rules (e.g. plans kept
   in a local file), point it out and let me decide.
4. Copy `${CLAUDE_PLUGIN_ROOT}/templates/pnt-standards.md` to
   `.claude/pnt-standards.md` (the PnT block imports it with
   `@.claude/pnt-standards.md`).
5. TypeScript/JavaScript tools (only if the stack includes TypeScript or JavaScript). Two tools by Uncle Bob,
   installed once per machine in one Python environment, `$HOME\.venvs\pnt-tools`:
   `dryer` (finds duplicated code) and `crapper` (CRAP score: complexity × missing test
   coverage, per function).
   - Run every command in this step in PowerShell (not Bash).
   - Check them: `$HOME\.venvs\pnt-tools\Scripts\python -X utf8 -m dryer --help` and
     `$HOME\.venvs\pnt-tools\Scripts\python -X utf8 -m crapper --help`. If both run,
     skip the install.
   - Otherwise say what they are in one line, say they are recommended, and ask:
     "Install them? (y/n)". They need Python 3.11+ and git:
     ```
     python -m venv $HOME\.venvs\pnt-tools
     $HOME\.venvs\pnt-tools\Scripts\pip install git+https://github.com/unclebob/dryer@66ff6d21a42c04afcad89c78a80066176d1294b0 git+https://github.com/unclebob/crapper@6fd92c4c9bcc56efb64a2f8743d5a2993bcfd42d
     ```
   - Add `.metrics/` to the project's `.gitignore` (both write their reports there).
6. Atlassian mapping. Skip it if `CLAUDE.md` already has an `## Atlassian mapping`
   section (update it only if the developer asks).
   - Confluence space: the space where this project's documentation lives (the
     commands use it to find and update the project's pages). Take it from the
     "Catálogo de Projetos" page in Confluence space `PI1` ("Pnt - Interno"). If the
     catalog is unreachable or the project is not in it, ask in one line that says
     what it is for, e.g. "In which Confluence space is this project's documentation?
     The commands use it to find and update its pages. Suggestion: PI1."
   - Board ID: don't ask. Use the `claude.ai Atlassian MCP` server: `executeRead` with
     `name: "getJiraBoardSprintData"`, `inputs: {"projectKeyOrId": "<KEY>",
     "includeIssues": false}` and `responseFields: ["board.id", "board.name",
     "board.type"]`. If the project has no board, use `—`.
   - Write the table below the Project profile in `CLAUDE.md`, with the marker
     `<!-- schema: 1 -->`:

     ```markdown
     ## Atlassian mapping

     <!-- schema: 1 -->

     | Jira project | Confluence space | Board ID |
     |---|---|---|
     | OMNI | SO | 81 |
     ```

   Values asked to the developer are marked as such.
7. Say what was done, then tell me to run `/init` now: it fills in the
   stack, the layout and the build commands below the PnT block and the
   Project profile. Then `CLAUDE.md` and `.claude/pnt-standards.md` must be
   committed.
