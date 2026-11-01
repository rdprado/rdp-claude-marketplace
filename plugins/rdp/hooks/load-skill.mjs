// Skills load only when the model decides to; this hook makes sure the right ones are loaded.
// - On a Skill call: records that this session loaded that skill (skill-markers.mjs).
// - Before an edit of a code/config file, a `git commit` or a `git push`: if a skill it needs isn't loaded yet in this
//   session, refuses the call and says which skills to load. The model loads them and tries again.
// Runs only in RDP projects (CLAUDE.md with the RDP block, or an older .claude/rdp-standards.md copy).
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { isLoaded, markLoaded } from './skill-markers.mjs';

const TS_EXTENSIONS = ['.ts', '.tsx', '.svelte', '.js', '.jsx', '.mjs'];
const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit'];
const SHELL_TOOLS = ['Bash', 'PowerShell'];

const input = JSON.parse(await readStdin());
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? '.';
if (isRdpProject(projectDir)) {
  if (input.tool_name === 'Skill') {
    markLoaded(input.session_id, qualified(input.tool_input?.skill ?? ''));
  } else {
    const missing = skillsNeeded(input.tool_name, input.tool_input ?? {})
      .filter((skill) => !isLoaded(input.session_id, skill));
    if (missing.length > 0) refuse(missing);
  }
}

function skillsNeeded(toolName, toolInput) {
  if (WRITE_TOOLS.includes(toolName)) return skillsForFile(toolInput.file_path ?? '');
  if (SHELL_TOOLS.includes(toolName)) return skillsForCommand(toolInput.command ?? '');
  return [];
}

function skillsForCommand(command) {
  const skills = [];
  if (/\bgit\s+commit\b/.test(command)) skills.push('rdp:git-flow');
  if (/\bgit\s+push\b/.test(command)) skills.push('rdp:git-flow');
  return [...new Set(skills)];
}

function skillsForFile(path) {
  const normalized = path.replaceAll('\\', '/');
  const name = basename(normalized);
  const ext = extname(normalized).toLowerCase();
  const skills = [];
  if (ext === '.cs' || TS_EXTENSIONS.includes(ext)) skills.push('rdp:rdp-mode');
  if (ext === '.cs') {
    if (/Hub\.cs$/.test(name)) skills.push('rdp:signalr');
  }
  if (TS_EXTENSIONS.includes(ext)) {
    if (name.startsWith('hooks.server.') || normalized.includes('/lib/server/')) skills.push('rdp:bff');
  }
  if (/^appsettings.*\.json$/i.test(name)) skills.push('rdp:configuration');
  if (name === 'bitbucket-pipelines.yml' || /(^|\/)ci\//.test(normalized)) skills.push('rdp:pipelines');
  return skills;
}

function refuse(skills) {
  const list = skills.map((s) => '`' + s + '`').join(' and ');
  const reason = `RDP: load ${list} with the Skill tool first, then make this call again.`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
}

function isRdpProject(dir) {
  const claudeMdPath = join(dir, 'CLAUDE.md');
  const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
  return claudeMd.includes('<!-- RDP block') || existsSync(join(dir, '.claude', 'rdp-standards.md'));
}

function qualified(skill) {
  return skill.includes(':') ? skill : `rdp:${skill}`;
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}
