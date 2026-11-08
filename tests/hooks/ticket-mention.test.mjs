// Unit tests for plugins/rdp/hooks/ticket-mention.mjs: a prompt in, the pickup reminder (or nothing) out.
//   node --test tests/hooks/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins', 'rdp', 'hooks', 'ticket-mention.mjs');
const BLOCK = '# x\n<!-- RDP block -->\nRules.\n<!-- end RDP block -->\n';
const MAPPED = `${BLOCK}## Project profile\n\n- Legacy: NO\n\n## GitHub mapping\n\n<!-- schema: 1 -->\n\n| GitHub repo | Docs folder | Project board |\n|---|---|---|\n| rdprado/app | docs/ | — |\n`;

function project(claudeMd) {
  const dir = mkdtempSync(join(tmpdir(), 'rdp-hook-test-'));
  if (claudeMd) writeFileSync(join(dir, 'CLAUDE.md'), claudeMd);
  return dir;
}

function reminder(dir, session, prompt) {
  const out = spawnSync('node', [HOOK], {
    input: JSON.stringify({ session_id: session, cwd: dir, prompt }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout ? JSON.parse(out.stdout).hookSpecificOutput.additionalContext : null;
}

test('an issue number gets the pickup reminder, once per session', () => {
  const dir = project(MAPPED);
  const session = randomUUID();
  assert.match(reminder(dir, session, 'vamos trabalhar na #42'), /\/rdp:pickup #42/);
  assert.equal(reminder(dir, session, '#42 de novo'), null);
  assert.match(reminder(dir, session, 'agora a #43'), /#43/);
});

test('this repo by name counts; another repo is ignored', () => {
  assert.match(reminder(project(MAPPED), randomUUID(), 'olha rdprado/app#7'), /#7/);
  assert.equal(reminder(project(MAPPED), randomUUID(), 'olha other/lib#7'), null);
});

test('before setup, the profile repo is used', () => {
  const profile = `${BLOCK}- GitHub repo: \`rdprado/app\` — tag \`[App]\`\n`;
  assert.match(reminder(project(profile), randomUUID(), 'rdprado/app#9'), /#9/);
});

test('no issue, or not a RDP project: nothing', () => {
  assert.equal(reminder(project(MAPPED), randomUUID(), 'how does the hub work?'), null);
  assert.equal(reminder(project(null), randomUUID(), '#1'), null);
});
