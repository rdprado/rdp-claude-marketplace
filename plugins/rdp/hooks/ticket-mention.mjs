// When a message mentions an issue of this project (`#123`, or `owner/repo#123`), reminds Claude to pick
// the issue up first (/rdp:pickup: assignee, in progress, branch, start comment). Once per issue per
// session; nothing is written in the project.
// Runs only in RDP projects (CLAUDE.md with the RDP block).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLoaded, markLoaded } from './skill-markers.mjs';

const input = JSON.parse(await readStdin());
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? '.';
const claudeMdPath = join(projectDir, 'CLAUDE.md');
const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';

if (claudeMd.includes('<!-- RDP block')) {
  const issue = issueMentioned(input.prompt ?? '', projectRepo(claudeMd));
  const marker = issue && `pickup-${issue}`;
  if (issue && !isLoaded(input.session_id, marker)) {
    markLoaded(input.session_id, marker);
    const context = `The message mentions issue #${issue}. Unless it was already picked up in this session, `
      + `pick it up before any code change: /rdp:pickup #${issue} (assignee gate, in progress, branch, `
      + 'start comment), as the github-issues skill says. Only reading or asking about it needs no pickup.';
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }));
  }
}

// `#123` alone, or `owner/repo#123` only when it is this project's repo.
function issueMentioned(prompt, repo) {
  for (const m of prompt.matchAll(/(?:\b([\w.-]+\/[\w.-]+))?#(\d+)\b/g)) {
    if (!m[1] || (repo && m[1].toLowerCase() === repo.toLowerCase())) return m[2];
  }
  return null;
}

function projectRepo(text) {
  const table = text.split(/^## GitHub mapping\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const fromTable = table.match(/^\|\s*([\w.-]+\/[\w.-]+)\s*\|/m)?.[1];
  return fromTable ?? text.match(/^- GitHub repo: `([\w.-]+\/[\w.-]+)`/m)?.[1] ?? null;
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}
