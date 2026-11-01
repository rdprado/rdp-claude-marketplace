// Which skills a session has loaded: one empty marker file per skill per session, in the temp folder.
// load-skill.mjs writes and reads them; session-context.mjs forgets them after /compact and /clear,
// because the skill text may no longer be in the context then.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = join(tmpdir(), 'rdp-skill-hook');

export function isLoaded(sessionId, skill) {
  return existsSync(markerPath(sessionId, skill));
}

export function markLoaded(sessionId, skill) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(markerPath(sessionId, skill), '');
}

export function forgetSession(sessionId) {
  if (!sessionId || !existsSync(DIR)) return;
  for (const name of readdirSync(DIR)) {
    if (name.startsWith(`${sessionId}-`)) rmSync(join(DIR, name), { force: true });
  }
}

function markerPath(sessionId, skill) {
  return join(DIR, `${sessionId}-${skill.replace(':', '_')}`);
}
