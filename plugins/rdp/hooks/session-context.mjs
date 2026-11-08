// At the start of every session (and after /clear and /compact) puts the project's stack template
// into the context, straight from the installed plugin. Updating the plugin updates every project on
// its next session; nothing is copied into the project. The rules themselves are the rdp-mode skill.
// Runs only in RDP projects (CLAUDE.md with the RDP block). While a project still has the template
// sections in CLAUDE.md, they are skipped.
// After /compact or /clear it also forgets which skills the session loaded, so the next edit loads
// them again in full (load-skill.mjs refuses it until then).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forgetSession } from './skill-markers.mjs';

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT;
const CONTEXT_LIMIT = 10000; // Claude Code moves longer hook output to a file and shows only a preview

const STACK_FILES = {
  'WinForms (Passive View)': 'winforms-passive-view.md',
  'Svelte + BFF': 'svelte-bff.md',
  'Svelte + BFF + ASP.NET Core back end': 'svelte-bff-aspnetcore.md',
};

const input = JSON.parse(await readStdin());
if (input.source === 'compact' || input.source === 'clear') forgetSession(input.session_id);
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? '.';
const claudeMd = readIfExists(join(projectDir, 'CLAUDE.md'));

if (claudeMd?.includes('<!-- RDP block')) {
  const stack = template(claudeMd);
  if (stack) {
    const context = `RDP rules for this project, loaded from the rdp plugin (v${pluginVersion()}):\n\n${stack}`;
    if (context.length > CONTEXT_LIMIT) {
      process.stderr.write(`rdp: session context is ${context.length} characters, over the ${CONTEXT_LIMIT} limit\n`);
    }
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
  }
}

// The stack file's "## Template" and "## Layout" sections, with <App> filled from the profile.
function template(projectClaudeMd) {
  if (projectClaudeMd.includes('## Template:')) return null; // still written into CLAUDE.md
  const name = profileValue(projectClaudeMd, 'Template');
  const file = name && STACK_FILES[name];
  if (!file) return null;
  const stack = readFileSync(join(PLUGIN_ROOT, 'templates', 'claude-md', 'modern', file), 'utf8');
  const start = stack.indexOf('## Template');
  const end = stack.search(/^Build:/m);
  const sections = stack.slice(start, end === -1 ? undefined : end).trim();
  const app = profileValue(projectClaudeMd, 'App');
  return app ? sections.replaceAll('<App>', app) : sections;
}

function profileValue(text, key) {
  return text.match(new RegExp(`^- ${key}:\\s*(.+?)\\s*$`, 'm'))?.[1] ?? null;
}

function pluginVersion() {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}
