// Unit tests for plugins/rdp/scripts/sonar-local.mjs: the parts that need no Sonar server or scanner.
//   node --test tests/scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classify, formatReport, localKey, parseArgs, parseChangedLines, parseSetupFile, serverAddress,
} from '../../plugins/rdp/scripts/sonar-local.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins', 'rdp', 'scripts', 'sonar-local.mjs');

const KEY = 'market-local-renato';

function issue(fields) {
  return { rule: 'csharpsquid:S1', message: 'm', impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'LOW' }], ...fields };
}

test('names the local project <official>-local-<dev> from the git email', () => {
  assert.equal(localKey('market', 'Renato.Prado@plugntrade.com.br'), 'market-local-renato.prado');
});

test('replaces characters a project key does not allow', () => {
  assert.equal(localKey('market', 'joão silva'), 'market-local-jo-o-silva');
});

test('refuses to name the local project without a developer', () => {
  assert.throws(() => localKey('market', ''), /SONAR_LOCAL_USER/);
  assert.throws(() => localKey('market', undefined), /SONAR_LOCAL_USER/);
});

test('reads the official key and the options', () => {
  assert.deepEqual(parseArgs(['market', '--solution', 'api/Market.slnx', '--base', 'release/3.1']), {
    officialKey: 'market', solution: 'api/Market.slnx', base: 'release/3.1',
  });
  assert.deepEqual(parseArgs(['market']), { officialKey: 'market', solution: undefined, base: 'main' });
});

test('refuses a run without the official key', () => {
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(['--base', 'main']), /usage/);
});

test('turns a zero-context diff into changed line ranges, skipping deletions and deleted files', () => {
  const diff = [
    'diff --git a/api/src/A.cs b/api/src/A.cs',
    '--- a/api/src/A.cs',
    '+++ b/api/src/A.cs',
    '@@ -10,2 +10,3 @@ class A',
    '@@ -20 +21 @@',
    '@@ -30,4 +32,0 @@',
    'diff --git a/api/src/Gone.cs b/api/src/Gone.cs',
    '--- a/api/src/Gone.cs',
    '+++ /dev/null',
    '@@ -1,5 +0,0 @@',
  ].join('\n');

  assert.deepEqual(parseChangedLines(diff, ['api/src/New.cs']), [
    { file: 'api/src/A.cs', start: 10, end: 12 },
    { file: 'api/src/A.cs', start: 21, end: 21 },
    { file: 'api/src/New.cs', start: 1, end: Infinity },
  ]);
});

test('an issue on a changed line is new; one outside the changed lines is debt', () => {
  const changed = [{ file: 'src/A.cs', start: 10, end: 12 }];
  const result = classify(
    [issue({ component: `${KEY}:src/A.cs`, line: 11 }), issue({ component: `${KEY}:src/A.cs`, line: 13 })],
    changed,
    KEY
  );

  assert.deepEqual(result.new.map((i) => i.line), [11]);
  assert.equal(result.debtCount, 1);
});

test('a file-level issue is new when its file changed', () => {
  const result = classify([issue({ component: `${KEY}:src/A.cs` })], [{ file: 'src/A.cs', start: 5, end: 5 }], KEY);

  assert.equal(result.new.length, 1);
});

test('matches a Sonar path to the git path that ends with it (solution in a subfolder)', () => {
  const result = classify(
    [issue({ component: `${KEY}:src/A.cs`, line: 3 }), issue({ component: `${KEY}:rc/A.cs`, line: 3 })],
    [{ file: 'api/src/A.cs', start: 1, end: 5 }],
    KEY
  );

  assert.deepEqual(result.new.map((i) => i.path), ['src/A.cs']);
});

test('lists new issues by most severe impact: security before reliability, blocker before high', () => {
  const changed = [{ file: 'A.cs', start: 1, end: Infinity }];
  const result = classify(
    [
      issue({ component: `${KEY}:A.cs`, line: 1, rule: 'low' }),
      issue({ component: `${KEY}:A.cs`, line: 2, rule: 'reliability', impacts: [{ softwareQuality: 'RELIABILITY', severity: 'BLOCKER' }] }),
      issue({
        component: `${KEY}:A.cs`, line: 3, rule: 'two-impacts',
        impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'LOW' }, { softwareQuality: 'SECURITY', severity: 'HIGH' }],
      }),
    ],
    changed,
    KEY
  );

  assert.deepEqual(result.new.map((i) => i.rule), ['two-impacts', 'reliability', 'low']);
  assert.deepEqual(result.new[0].top, { softwareQuality: 'SECURITY', severity: 'HIGH' });
});

test('counts debt once per impact and counts issues without impacts', () => {
  const result = classify(
    [
      issue({ component: `${KEY}:B.cs`, line: 1 }),
      issue({
        component: `${KEY}:B.cs`, line: 2,
        impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'LOW' }, { softwareQuality: 'RELIABILITY', severity: 'HIGH' }],
      }),
      issue({ component: `${KEY}:B.cs`, line: 3, impacts: [] }),
    ],
    [],
    KEY
  );

  assert.equal(result.debtCount, 3);
  assert.deepEqual(result.debtCountsByImpact, [
    { impact: 'RELIABILITY / HIGH', count: 1 },
    { impact: 'MAINTAINABILITY / LOW', count: 2 },
  ]);
  assert.equal(result.withoutImpacts, 1);
});

test('reports every gate condition, the new issues in full and the debt as counts', () => {
  const gate = {
    projectStatus: {
      status: 'ERROR',
      conditions: [
        { status: 'ERROR', metricKey: 'new_coverage', comparator: 'LT', errorThreshold: '80', actualValue: '50.0' },
        { status: 'OK', metricKey: 'new_violations', comparator: 'GT', errorThreshold: '0' },
      ],
    },
  };
  const classified = classify(
    [issue({ component: `${KEY}:A.cs`, line: 2, message: 'Remove this' }), issue({ component: `${KEY}:B.cs`, line: 1 })],
    [{ file: 'A.cs', start: 1, end: 3 }],
    KEY
  );

  const report = formatReport(gate, classified, { key: KEY, totalOpen: 2, mergeBase: 'abcdef1234567890' });

  assert.match(report, /quality gate \(market-local-renato\): ERROR/);
  assert.match(report, /ERROR {2}new_coverage LT 80 \(actual: 50\.0\)/);
  assert.match(report, /OK {2}new_violations GT 0 \(actual: n\/a\)/);
  assert.match(report, /NEW FROM THIS WORK: 1\n {2}MAINTAINABILITY\/LOW {2}csharpsquid:S1 {2}A\.cs:2 {2}Remove this/);
  assert.match(report, /PRE-EXISTING DEBT: 1/);
  assert.doesNotMatch(report, /B\.cs/);
});

test('reads url and token from the setup file, ignoring comments and blanks', () => {
  const text = '# Type the Sonar URL...\r\nurl= https://sonar.example \r\ntoken=\r\n';

  assert.deepEqual(parseSetupFile(text), { url: 'https://sonar.example' });
  assert.deepEqual(parseSetupFile('url=u\ntoken=t\n'), { url: 'u', token: 't' });
});

// Windows only: DPAPI. A filled setup file becomes an encrypted token, and the file is deleted.
test('setup encrypts the token from a filled file and deletes the file', { skip: process.platform !== 'win32' }, () => {
  const appData = mkdtempSync(join(tmpdir(), 'rdp-sonar-setup-'));
  const folder = join(appData, 'rdp');
  mkdirSync(folder);
  writeFileSync(join(folder, 'sonar-setup.txt'), '# comment\nurl=https://sonar.example/\ntoken=fake-token-123\n');

  const result = spawnSync('node', [SCRIPT, 'setup'], { encoding: 'utf8', env: { ...process.env, APPDATA: appData } });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(folder, 'sonar-setup.txt')), false);
  const saved = readFileSync(join(folder, 'sonar.json'), 'utf8');
  assert.equal(JSON.parse(saved).hostUrl, 'https://sonar.example');
  assert.doesNotMatch(saved, /fake-token-123/);
  assert.doesNotMatch(result.stdout + result.stderr, /fake-token-123/);
});

test('keeps only the server from a URL copied from the browser', () => {
  assert.equal(serverAddress('http://172.31.0.1:9000/tutorials?id=X'), 'http://172.31.0.1:9000');
  assert.equal(serverAddress('https://sonar.example/'), 'https://sonar.example');
  assert.throws(() => serverAddress('sonar.example'), /web address/);
});
