---
name: update-docs
description: "RDP docs in the repo's docs/ folder: before pushing a branch (in SVN, when the developer says the work is ready), check whether the change affects the project's intro page, propose a diff, write only on approval. Also creates the intro for a project that has none. Use before any git push, or when asked to document or update a project's docs."
---
# Update docs (docs/)

Before every `git push` of a branch with code changes (in SVN, when the developer says the work is ready to commit), check the project's docs. Also run it when
the developer asks to document the project. Writing to `docs/` always needs an explicit "yes".

## Where the docs live

- **The intro page** in the docs folder from the `## GitHub mapping` table of the project's
  `CLAUDE.md` (default `docs/`), e.g. `docs/intro.md`: Repositório (first line), Introdução, Stack,
  Como rodar / build, Dependências (table), Instâncias, Documentação da API, Links úteis, Contatos,
  Versão, then project-specific sections.
- The page keeps only what changes little. No versions, libraries, IPs, ports or full method lists —
  point to where they live (`.csproj`, `appsettings`, pipeline).

Read and write with the `github-issues` skill's rules ("Docs").

## Steps

1. **Find the intro** in the docs folder.
   - None: offer to create it now, if there is code to describe. Draft it, show it, write on approval.
2. **Scope the change**, every time, with nothing stored locally. Check the working directory: `.git`
   → git; `.svn` (or `svn info` works) → SVN; neither → ask.
   - Git: the whole branch against its base, `git diff <base>...HEAD --stat` (`<base>` is `main`, or
     the `release/X.Y.x` branch under Flow A).
   - SVN (no branches, no PR): on the working copy's changes, `svn diff --summarize`. Never run
     `svn commit`: the developer commits.
3. **Map the change to sections:**

   | The branch changes… | Update |
   |---|---|
   | what the system does, a new part (web, API, worker) | Introdução |
   | language or structural technology | Stack |
   | build/run prerequisites, CI/CD | Como rodar / build |
   | an external system, a config key that turns one on | Dependências table |
   | environments or who uses them | Instâncias |
   | a REST endpoint or SignalR hub/method | Documentação da API |
   | the tag format | Versão |
   | an important flow, a non-obvious decision, troubleshooting | a project-specific section |

   Check every fact in the code, not in the old page.
4. **Draft a diff per page** — only the changed sections, never a rewrite. If nothing is affected,
   say "No doc impact" explicitly; never skip silently.
5. **Show it and wait** for an explicit yes.
6. **Write** (patch only the changed sections), then read it back and give the developer the path
   of every page touched. The page goes in the same branch, so it ships with the change.

## Don't

- Don't write to `docs/` without an explicit yes, or rewrite a whole page for a small change.
- Don't put versions, IPs, secrets or incident stories in the intro.
- Don't create a page outside the docs folder in the `## GitHub mapping` table.
