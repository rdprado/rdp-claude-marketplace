---
description: Once per project — helps you write or update CLAUDE.md with the RDP AI standards
---
Set up this project with the RDP AI standards.

0. Print the text below first, exactly as written, in a code block, then a
   blank line:

   ```
   ░     │ ▄▀▓ █
   ░ RDP │ ▒▀▓ █
   ```

1. Ask: "Is <current folder> the project you want to set up?" If not, say:
   "Go to the project's folder, start Claude there and run /rdp:setup-repo
   again." and stop.
   Then pick the case and say it in one line:
   - **New setup:** no `CLAUDE.md`. Run steps 2–8.
   - **Existing CLAUDE.md, never set up:** `CLAUDE.md` has no RDP block. Run steps
     2–8; step 3 merges into the file instead of copying the template.
   - **Already set up (sync):** `CLAUDE.md` has the RDP block. Run steps 2–8 in sync
     mode: bring the project up to date with the current templates and fill what is
     missing, without redoing what is already there:
     - Step 2: for each answer already in the Project profile (legacy, stack, GitHub repo,
       tag), re-detect it from the files and keep it if it still matches.
       Ask only for placeholders (`<...>`) and for values that no longer match the
       files (e.g. profile says .NET but `package.json` now exists too).
       Before asking anything, show what is kept, with each value and one line on
       what it is, e.g.:
       ```
       Kept (already set):
       - Legacy: NO (modern project, clean architecture)
       - GitHub repo: rdprado/stimulus-app (where story issues are created)
       - Tag: [MarketPlaceExperimentation] (prefix of every issue title)
       - GitHub mapping: rdprado/stimulus-app · docs/ · no project board
       - RDP standards: up to date (2.11.1)
       Still to fill: Stack, Git flow, Docs, Sonar, Build commands
       ```
     - Step 3: compare `CLAUDE.md` with the matching template (see step 3).
     - Step 4: compare `.claude/rdp-standards.md` and the RDP block with
       `${CLAUDE_PLUGIN_ROOT}/templates/` (see step 4).
     - Steps 5–6 as written (both skip what is already done).
     - Step 7: list what changed. Suggest `/init` only if the stack, layout or
       build commands are still placeholders.
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
   - GitHub repo (`owner/repo`). Detect it with `gh repo view --json nameWithOwner`
     (falls back to the `origin` remote URL) and let me confirm or change it. If `gh`
     is not installed or not logged in, ask me for it.
   - Tag (e.g. `[WebBroker]`): the prefix of every issue title in that GitHub
     repo. Suggest it from the folder name, in the same form as the repo's
     name.
3. If the project has no `CLAUDE.md`: copy
   `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.legacy.md` (legacy) or
   `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.project.md` (not legacy) to the
   project root as `CLAUDE.md`, filling in the GitHub repo and the tag.
   If it already has one: never overwrite it. Compare it with the matching
   template and show me what's missing (the RDP block, Project profile
   lines, sections, ...) and which lines still hold placeholders (`<...>`).
   For each placeholder, fill it from the files (e.g. stack from `.csproj`,
   build commands, Sonar key from `ci/verify.sh`) and show it, or ask; if it
   doesn't apply yet (e.g. no CI), suggest `N/A`. Add only what I approve: the
   RDP block at the top, missing sections below it, leaving everything already
   there untouched. If something there contradicts the RDP rules (e.g. plans
   kept in a local file, a task journal), point it out and let me decide.
4. RDP standards. If `.claude/rdp-standards.md` doesn't exist, copy
   `${CLAUDE_PLUGIN_ROOT}/templates/rdp-standards.md` there (the RDP block
   imports it with `@.claude/rdp-standards.md`). If it exists and differs from
   the template (or the RDP block differs), say "The RDP standards in this
   project are out of date", list the changes in a few lines, and ask before
   replacing them.
5. TypeScript/JavaScript tools (only if the stack includes TypeScript or JavaScript). Two tools by Uncle Bob,
   installed once per machine in one Python environment, `$HOME\.venvs\pnt-tools`:
   `dryer` (finds duplicated code) and `crapper` (CRAP score: complexity × missing test
   coverage, per function). .NET has none of these yet: Sonar is its only check.
   A project can be .NET only, TypeScript/JavaScript only, or both. With both, offer
   the tools for the TypeScript/JavaScript code; the .NET code stays on Sonar only.
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
6. GitHub mapping. Skip it if `CLAUDE.md` already has a `## GitHub mapping`
   section (update it only if the developer asks).
   - Docs folder: the folder where this project's documentation lives (the
     commands use it to find and update the project's pages). Detect it (`docs/`
     at the repo root, or another folder of `.md` docs). If there is none, ask in
     one line that says what it is for, e.g. "In which folder is this project's
     documentation? The commands use it to find and update its pages. Suggestion: docs/."
   - Project board: don't ask. Run `gh project list --owner <owner> --format json`
     and take the board linked to this repo, if any. If the repo has no board, use `—`.
   - Write the table below the Project profile in `CLAUDE.md`, with the marker
     `<!-- schema: 1 -->`:

     ```markdown
     ## GitHub mapping

     <!-- schema: 1 -->

     | GitHub repo | Docs folder | Project board |
     |---|---|---|
     | rdprado/stimulus-app | docs/ | — |
     ```

   Values asked to the developer are marked as such.
7. Say what was done, then tell me to run `/init` now: it fills in the
   stack, the layout and the build commands below the RDP block and the
   Project profile. Then `CLAUDE.md` and `.claude/rdp-standards.md` must be
   committed.
8. Finish ready for a context clear: everything decided in this conversation
   must already be in the files (nothing left only in chat). End with:
   "Setup done. If you're going to start working on the project now, I
   recommend clearing the context first (`/clear`), so the AI works at its peak."
