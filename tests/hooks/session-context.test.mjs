// Unit tests for plugins/rdp/hooks/session-context.mjs: what it injects, and that /compact and /clear
// make load-skill.mjs ask for the skills again. No tokens spent.
//   node --test tests/hooks/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins', 'rdp');
const CLAUDE_MD = '# x\n<!-- RDP block -->\nRules.\n<!-- end RDP block -->\n- App: Shop\n- Template: Svelte + BFF + ASP.NET Core back end\n- Legacy: NO\n';

function project(claudeMd) {
  const dir = mkdtempSync(join(tmpdir(), 'rdp-hook-test-'));
  if (claudeMd) writeFileSync(join(dir, 'CLAUDE.md'), claudeMd);
  return dir;
}

function run(hook, dir, input) {
  const out = spawnSync('node', [join(PLUGIN, 'hooks', hook)], {
    input: JSON.stringify({ cwd: dir, ...input }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: PLUGIN },
  });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout ? JSON.parse(out.stdout).hookSpecificOutput : null;
}

function sessionStart(dir, session, source) {
  return run('session-context.mjs', dir, { session_id: session, source })?.additionalContext ?? null;
}

function writeRefused(dir, session) {
  const decision = run('load-skill.mjs', dir, { session_id: session, tool_name: 'Write', tool_input: { file_path: `${dir}/src/Order.cs` } });
  return decision?.permissionDecision === 'deny';
}

function loadSkill(dir, session) {
  run('load-skill.mjs', dir, { session_id: session, tool_name: 'Skill', tool_input: { skill: 'rdp:rdp-mode' } });
}

test('injects the template with <App> filled, and no standards (the rules are the rdp-mode skill)', () => {
  const context = sessionStart(project(CLAUDE_MD), randomUUID(), 'startup');
  assert.doesNotMatch(context, /RDP AI standards/);
  assert.match(context, /src\/Shop\.Api/);
  assert.doesNotMatch(context, /<App>/);
  assert.ok(context.length < 10000, `${context.length} characters, over the hook limit`);
});

test('skips the template sections the project still has in CLAUDE.md', () => {
  const context = sessionStart(project('# x\n<!-- RDP block -->\n<!-- end RDP block -->\n- Template: Svelte + BFF\n## Template: Svelte + BFF\n'), randomUUID(), 'startup');
  assert.equal(context, null);
});

test('not a RDP project: nothing injected', () => {
  assert.equal(sessionStart(project(null), randomUUID(), 'startup'), null);
});

for (const source of ['compact', 'clear']) {
  test(`after /${source}, the next edit needs the skill again`, () => {
    const dir = project(CLAUDE_MD);
    const session = randomUUID();
    loadSkill(dir, session);
    assert.equal(writeRefused(dir, session), false);
    sessionStart(dir, session, source);
    assert.equal(writeRefused(dir, session), true);
  });
}

test('startup and resume keep the loaded skills', () => {
  const dir = project(CLAUDE_MD);
  const session = randomUUID();
  loadSkill(dir, session);
  sessionStart(dir, session, 'resume');
  assert.equal(writeRefused(dir, session), false);
});

test('a compact forgets only its own session', () => {
  const dir = project(CLAUDE_MD);
  const other = randomUUID();
  loadSkill(dir, other);
  sessionStart(dir, randomUUID(), 'compact');
  assert.equal(writeRefused(dir, other), false);
});
