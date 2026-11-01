// Unit tests for plugins/rdp/hooks/load-skill.mjs: fake hook input in, decision out. No tokens spent.
//   node --test tests/hooks/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins', 'rdp', 'hooks', 'load-skill.mjs');
const RDP_CLAUDE_MD = '# x\n<!-- RDP block -->\nRules.\n<!-- end RDP block -->\n- Legacy: NO\n';
const LEGACY_CLAUDE_MD = '# x\n<!-- RDP block -->\nRules.\n<!-- end RDP block -->\n- Legacy: YES — old code\n';

function project(claudeMd) {
  const dir = mkdtempSync(join(tmpdir(), 'rdp-hook-test-'));
  if (claudeMd) writeFileSync(join(dir, 'CLAUDE.md'), claudeMd);
  return dir;
}

function runHook(dir, session, toolName, toolInput) {
  const out = spawnSync('node', [HOOK], {
    input: JSON.stringify({ session_id: session, cwd: dir, tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout ? JSON.parse(out.stdout).hookSpecificOutput : null;
}

function denied(dir, session, toolName, toolInput) {
  const decision = runHook(dir, session, toolName, toolInput);
  return decision?.permissionDecision === 'deny' ? decision.permissionDecisionReason : null;
}

test('refuses a .cs write until rdp-mode is loaded', () => {
  const dir = project(RDP_CLAUDE_MD);
  const session = randomUUID();
  assert.match(denied(dir, session, 'Write', { file_path: `${dir}/src/Order.cs` }), /rdp:rdp-mode/);
  runHook(dir, session, 'Skill', { skill: 'rdp:rdp-mode' });
  assert.equal(denied(dir, session, 'Write', { file_path: `${dir}/src/Order.cs` }), null);
});

test('a skill named without the plugin prefix counts as loaded', () => {
  const dir = project(RDP_CLAUDE_MD);
  const session = randomUUID();
  runHook(dir, session, 'Skill', { skill: 'rdp-mode' });
  assert.equal(denied(dir, session, 'Edit', { file_path: 'C:\\p\\src\\Order.cs' }), null);
});

test('TS code needs rdp-mode too, the same as C#', () => {
  const dir = project(RDP_CLAUDE_MD);
  assert.match(denied(dir, randomUUID(), 'Write', { file_path: `${dir}/web/src/Order.svelte` }), /rdp:rdp-mode/);
});

test('hooks.server.ts needs both rdp-mode and bff', () => {
  const dir = project(RDP_CLAUDE_MD);
  const session = randomUUID();
  const reason = denied(dir, session, 'Write', { file_path: `${dir}/web/src/hooks.server.ts` });
  assert.match(reason, /rdp:rdp-mode/);
  assert.match(reason, /rdp:bff/);
  runHook(dir, session, 'Skill', { skill: 'rdp:rdp-mode' });
  assert.doesNotMatch(denied(dir, session, 'Write', { file_path: `${dir}/web/src/hooks.server.ts` }), /rdp-mode/);
});

test('test files need only rdp-mode (its Tests section)', () => {
  const dir = project(RDP_CLAUDE_MD);
  const session = randomUUID();
  runHook(dir, session, 'Skill', { skill: 'rdp:rdp-mode' });
  assert.equal(denied(dir, session, 'Write', { file_path: `${dir}/tests/App.Tests.Unit/OrderTests.cs` }), null);
  assert.equal(denied(dir, session, 'Write', { file_path: `${dir}/web/src/x.test.ts` }), null);
});

test('hubs, appsettings and pipelines need their skills', () => {
  const dir = project(RDP_CLAUDE_MD);
  assert.match(denied(dir, randomUUID(), 'Write', { file_path: `${dir}/src/Api/OrdersHub.cs` }), /rdp:signalr/);
  assert.match(denied(dir, randomUUID(), 'Edit', { file_path: `${dir}/src/Api/appsettings.Development.json` }), /rdp:configuration/);
  assert.match(denied(dir, randomUUID(), 'Edit', { file_path: `${dir}/bitbucket-pipelines.yml` }), /rdp:pipelines/);
});

test('git commit needs git-flow; other shell commands pass', () => {
  const dir = project(RDP_CLAUDE_MD);
  const session = randomUUID();
  assert.match(denied(dir, session, 'Bash', { command: 'git add -A && git commit -m "x"' }), /rdp:git-flow/);
  assert.match(denied(dir, session, 'PowerShell', { command: 'git commit -F msg.txt' }), /rdp:git-flow/);
  assert.equal(denied(dir, session, 'Bash', { command: 'git status' }), null);
  runHook(dir, session, 'Skill', { skill: 'rdp:git-flow' });
  assert.equal(denied(dir, session, 'Bash', { command: 'git commit -m "x"' }), null);
});

test('git push needs git-flow', () => {
  const dir = project(RDP_CLAUDE_MD);
  const session = randomUUID();
  assert.match(denied(dir, session, 'Bash', { command: 'git push origin feature/TESTE-1-x' }), /rdp:git-flow/);
  runHook(dir, session, 'Skill', { skill: 'rdp:git-flow' });
  assert.equal(denied(dir, session, 'Bash', { command: 'git push origin feature/TESTE-1-x' }), null);
});

test('markdown and other files pass', () => {
  const dir = project(RDP_CLAUDE_MD);
  assert.equal(denied(dir, randomUUID(), 'Write', { file_path: `${dir}/README.md` }), null);
  assert.equal(denied(dir, randomUUID(), 'Write', { file_path: `${dir}/web/package.json` }), null);
});

test('legacy projects need rdp-mode too', () => {
  const dir = project(LEGACY_CLAUDE_MD);
  assert.match(denied(dir, randomUUID(), 'Write', { file_path: `${dir}/src/Form1.cs` }), /rdp:rdp-mode/);
});

test('loading is per session', () => {
  const dir = project(RDP_CLAUDE_MD);
  runHook(dir, 'session-a', 'Skill', { skill: 'rdp:rdp-mode' });
  assert.match(denied(dir, randomUUID(), 'Write', { file_path: `${dir}/src/Order.cs` }), /rdp:rdp-mode/);
});

test('not a RDP project: nothing is refused', () => {
  const dir = project(null);
  assert.equal(denied(dir, randomUUID(), 'Write', { file_path: `${dir}/src/Order.cs` }), null);
  assert.equal(denied(dir, randomUUID(), 'Bash', { command: 'git commit -m x' }), null);
});
