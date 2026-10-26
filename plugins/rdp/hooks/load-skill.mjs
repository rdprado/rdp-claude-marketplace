// Skills load only when the model decides to; this hook makes the coding rules load for sure.
// Before the first edit of a code file in a session, it tells Claude which RDP skills to load.
// Runs only in RDP projects (those with .claude/rdp-standards.md), so PnT projects are untouched.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, basename } from 'node:path';

const TS_EXTENSIONS = ['.ts', '.tsx', '.svelte', '.js', '.jsx', '.mjs'];

const input = JSON.parse(await readStdin());
const filePath = input.tool_input?.file_path ?? '';
const skills = skillsFor(filePath);

if (skills.length > 0 && existsSync(join(input.cwd ?? '.', '.claude', 'rdp-standards.md'))) {
  const pending = skills.filter((skill) => firstTimeInSession(input.session_id, skill));
  if (pending.length > 0) {
    const context = `RDP: before editing ${basename(filePath)}, load ${pending.map((s) => '`' + s + '`').join(' and ')} with the Skill tool and follow it.`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } }));
  }
}

function skillsFor(path) {
  const ext = extname(path).toLowerCase();
  const isTest = /\.test\.|\.spec\.|Tests?[.\\/]/.test(path);
  if (TS_EXTENSIONS.includes(ext)) {
    return isTest ? ['rdp:clean-architecture-typescript', 'rdp:testing-typescript'] : ['rdp:clean-architecture-typescript'];
  }
  if (ext === '.cs') return isTest ? ['rdp:clean-architecture', 'rdp:testing'] : ['rdp:clean-architecture'];
  return [];
}

// One reminder per skill per session: a marker file in the temp folder.
function firstTimeInSession(sessionId, skill) {
  const dir = join(tmpdir(), 'rdp-skill-hook');
  const marker = join(dir, `${sessionId}-${skill.replace(':', '_')}`);
  if (existsSync(marker)) return false;
  mkdirSync(dir, { recursive: true });
  writeFileSync(marker, '');
  return true;
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}
