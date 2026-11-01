// Runs a local Sonar analysis of a .NET project and reports what this work added, without any ci/ files:
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/sonar-local.mjs" <official-key> [--solution <file>] [--base <branch>]
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/sonar-local.mjs" check [<official-key>]   (what is missing, and how to fix it)
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/sonar-local.mjs" setup      (once per machine: run it, then again on "done")
// Our server (Community Build) has no branch analysis, so the run goes to a project of your own,
// <official-key>-local-<dev>, with the official project's quality gate and profiles; "new from this work"
// comes from git diff, not from Sonar's new-code period. Rules: the sonar skill.
// The token comes from SONAR_TOKEN, or from the file `setup` writes, encrypted with Windows DPAPI: an
// environment variable is plain text that every process inherits. The token is never printed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPORT_DIR = join('.sonarqube', 'report');
const COVERAGE_DIR = join('.sonarqube', 'coverage');
const EXCLUSIONS =
  '**/*.cshtml,**/*.html,**/*.css,**/*.scss,**/wwwroot/**,**/*.js,**/*.ts,**/Scripts/**,**/node_modules/**,**/Migrations/**';
const PAGE_SIZE = 500;
// api/issues/search returns at most 10,000 results.
const MAX_PAGES = 20;
const QUALITY_RANK = { SECURITY: 0, RELIABILITY: 1, MAINTAINABILITY: 2 };
const SEVERITY_RANK = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

export function parseArgs(args) {
  const [officialKey] = args;
  if (!officialKey || officialKey.startsWith('--')) {
    throw new Error('usage: sonar-local.mjs <official-key> [--solution <file>] [--base <branch>]  (or: setup)');
  }
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  return { officialKey, solution: option('--solution'), base: option('--base') ?? 'main' };
}

// <dev> is SONAR_LOCAL_USER, or the part of the git email before @; project keys allow a-z 0-9 . _ -
export function localKey(officialKey, dev) {
  const name = (dev ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  if (!name) throw new Error("can't name your local Sonar project: set SONAR_LOCAL_USER or git user.email");
  return `${officialKey}-local-${name}`;
}

// ---------- Check: what this machine and project still need ----------

// What the developer reads in Claude while the setup file is open in Notepad.
const TOKEN_HELP = [
  'Sonar needs your URL and token on this machine.',
  'A file opened in Notepad: follow what it says, save and close it, then say "done" here.',
].join('\n');

// The setup file explains itself: the developer reads it in Notepad, Claude never does.
const SETUP_FILE_TEXT = [
  '# Sonar setup. Claude never reads this file: the script encrypts the token and deletes this file.',
  '#',
  '# url   = the Sonar server address only, e.g. http://172.31.0.1:9000 (anything after it is ignored).',
  '#         Open Sonar in your browser and copy the start of the address. Not sure? Ask your lead.',
  '# token = in Sonar: your avatar (top right) > My Account > Security > Generate Tokens.',
  '#         Any name, type "User Token", then Generate. Copy it right away: Sonar shows it only once.',
  '#         Already have one? Paste it.',
  '#',
  '# Fill in both lines below, save, close Notepad and say "done" in Claude.',
];

const SELF = `node "${fileURLToPath(import.meta.url)}"`;

// Each line says what is missing and the one command that fixes it. Returns true when nothing is.
async function check(officialKey) {
  const missing = [];
  if (!findJava()) missing.push('Java 17+ (the scanner needs it): winget install EclipseAdoptium.Temurin.17.JRE, then open a new terminal');
  const tools = spawnSync('dotnet', ['tool', 'list', '--global'], { encoding: 'utf8' });
  if (!/dotnet-sonarscanner/i.test(tools.stdout ?? '')) missing.push('Sonar scanner: dotnet tool install --global dotnet-sonarscanner --ignore-failed-sources');

  let secrets = null;
  try {
    secrets = loadSecrets();
  } catch {
    missing.push(`Sonar URL and token: run ${SELF} setup`);
  }
  if (secrets) await checkServer(sonarApi(secrets), officialKey, missing);

  for (const line of missing) console.log(`MISSING  ${line}`);
  if (missing.length === 0) console.log('sonar-local: ready');
  return missing.length === 0;
}

// A terminal opened before Java was installed still has the old PATH, so look where the installer puts it
// too, and hand that Java to the scanner (JAVA_HOME and PATH of this process and its children).
function findJava() {
  const adoptium = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Eclipse Adoptium');
  const installed = existsSync(adoptium) ? readdirSync(adoptium).map((dir) => join(adoptium, dir, 'bin', 'java.exe')) : [];
  for (const java of ['java', ...installed]) {
    const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
    if (Number((result.stderr ?? '').match(/version "(?:1\.)?(\d+)/)?.[1] ?? 0) < 17) continue;
    if (java !== 'java') {
      process.env.JAVA_HOME = dirname(dirname(java));
      process.env.PATH = `${dirname(java)}${delimiter}${process.env.PATH}`;
    }
    return true;
  }
  return false;
}

async function checkServer(api, officialKey, missing) {
  let valid;
  try {
    valid = await api('GET', 'api/authentication/validate');
  } catch (error) {
    missing.push(`Sonar server unreachable (${error.cause?.code ?? error.message}): check the URL and the VPN, then run setup again`);
    return;
  }
  if (!valid.json?.valid) {
    missing.push(`a valid Sonar token: delete ${secretsFile()}, then run ${SELF} setup`);
    return;
  }
  if (officialKey) {
    const shown = await api('GET', 'api/components/show', { component: officialKey });
    if (shown.status === 404) {
      console.log(`sonar-local: no project ${officialKey} on the server. If this project will go to production, ask the Sonar admin to create it and the pipeline to analyze it; local runs work meanwhile, with the server's default gate.`);
    }
    return;
  }
  // No key yet: Sonar projects named like this folder, so the developer can pick one.
  const name = process.cwd().split(/[\\/]/).pop();
  const found = await api('GET', 'api/components/search', { qualifiers: 'TRK', q: name.slice(0, 30), ps: 10 });
  const keys = (found.json?.components ?? []).map((c) => `${c.key} (${c.name})`);
  console.log(keys.length > 0
    ? `sonar-local: Sonar projects matching "${name}": ${keys.join(', ')}`
    : `sonar-local: no Sonar project matches "${name}"`);
}

// ---------- Secrets ----------

function secretsFile() {
  return join(process.env.APPDATA ?? join(homedir(), '.config'), 'rdp', 'sonar.json');
}

// The developer types the token in a file that Claude never reads, not in the chat.
function setupFile() {
  return join(dirname(secretsFile()), 'sonar-setup.txt');
}

// First run: writes the setup file and opens it in Notepad. Run again once it is filled in: encrypts the
// token for the current Windows user (DPAPI), saves it next to the URL and deletes the file.
function setup() {
  if (process.platform !== 'win32') throw new Error('setup uses Windows DPAPI; elsewhere set SONAR_HOST_URL and SONAR_TOKEN');
  const filled = existsSync(setupFile()) ? parseSetupFile(readFileSync(setupFile(), 'utf8')) : {};
  if (!filled.url || !filled.token) {
    mkdirSync(dirname(setupFile()), { recursive: true });
    const lines = [...SETUP_FILE_TEXT, `url=${filled.url ?? ''}`, 'token='];
    writeFileSync(setupFile(), `${lines.join('\r\n')}\r\n`);
    // Detached, so this script ends now instead of waiting for Notepad to close.
    spawn('notepad', [setupFile()], { detached: true, stdio: 'ignore' }).unref();
    console.log(TOKEN_HELP);
    return;
  }
  const encrypt = 'ConvertTo-SecureString $env:RDP_SONAR_PLAIN -AsPlainText -Force | ConvertFrom-SecureString';
  const result = spawnSync('powershell', ['-NoProfile', '-Command', encrypt], {
    encoding: 'utf8',
    env: { ...process.env, RDP_SONAR_PLAIN: filled.token },
  });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error("can't encrypt the token");
  writeFileSync(secretsFile(), JSON.stringify({ hostUrl: serverAddress(filled.url), token: result.stdout.trim() }, null, 2));
  rmSync(setupFile());
  console.log('sonar-local: token saved encrypted for your Windows user; the setup file is deleted.');
}

// A URL copied from the browser keeps only the server: http://host:9000/tutorials?id=X → http://host:9000
export function serverAddress(url) {
  if (!URL.canParse(url)) throw new Error('the url in the setup file is not a web address, e.g. http://host:9000');
  return new URL(url).origin;
}

export function parseSetupFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(url|token)\s*=\s*(.*?)\s*$/);
    if (match && match[2]) values[match[1]] = match[2];
  }
  return values;
}

function loadSecrets() {
  if (process.env.SONAR_HOST_URL && process.env.SONAR_TOKEN) {
    return { hostUrl: process.env.SONAR_HOST_URL.replace(/\/+$/, ''), token: process.env.SONAR_TOKEN };
  }
  if (!existsSync(secretsFile())) {
    throw new Error('no Sonar credentials: run `node sonar-local.mjs setup` (or set SONAR_HOST_URL and SONAR_TOKEN)');
  }
  const saved = JSON.parse(readFileSync(secretsFile(), 'utf8').replace(/^﻿/, ''));
  const decrypt = '[Net.NetworkCredential]::new("", (ConvertTo-SecureString $env:RDP_SONAR_SECRET)).Password';
  const result = spawnSync('powershell', ['-NoProfile', '-Command', decrypt], {
    encoding: 'utf8',
    env: { ...process.env, RDP_SONAR_SECRET: saved.token },
  });
  const token = result.stdout?.trim();
  if (result.status !== 0 || !token) throw new Error(`can't decrypt the token in ${secretsFile()}: run setup again`);
  return { hostUrl: saved.hostUrl, token };
}

// ---------- Sonar web API ----------

function sonarApi({ hostUrl, token }) {
  const auth = `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
  return async (method, path, params = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${hostUrl}/${path}${method === 'GET' ? `?${query}` : ''}`, {
      method,
      headers: { Authorization: auth, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? query : undefined,
    });
    const text = await response.text();
    return { status: response.status, json: text && response.ok ? JSON.parse(text) : null };
  };
}

function refused(action, needs) {
  return new Error(`your Sonar token can't ${action}; it needs ${needs}. Not falling back to server defaults.`);
}

// Creates the local project on the first run, then gives it the official project's quality gate and
// profiles on every run, so the result is judged by the same rules as CI. When there is no official
// project yet, CI would get the server defaults too, so the local one keeps them, and says so.
async function ensureLocalProject(api, officialKey, key) {
  const shown = await api('GET', 'api/components/show', { component: key });
  if (shown.status === 404) {
    console.log(`sonar-local: creating your local Sonar project ${key}`);
    const created = await api('POST', 'api/projects/create', { project: key, name: `${officialKey} (local)` });
    if (created.status !== 200) throw refused(`create ${key}`, "the global 'Create Projects' permission");
  } else if (shown.status !== 200) {
    throw refused(`read ${key}`, `'Browse' on ${key} (HTTP ${shown.status})`);
  }

  const gate = await api('GET', 'api/qualitygates/get_by_project', { project: officialKey });
  if (gate.status === 404) {
    console.log(`sonar-local: no official project ${officialKey} on the server: server default gate and profiles`);
    return;
  }
  if (gate.status !== 200) throw refused(`read the quality gate of ${officialKey}`, `'Browse' on ${officialKey}`);
  const adminHint = `'Administer' on ${key} (the default permission template must grant it to 'Project Creators')`;
  const gateName = gate.json.qualityGate.name;
  if ((await api('POST', 'api/qualitygates/select', { projectKey: key, gateName })).status >= 300) {
    throw refused(`assign quality gate '${gateName}' to ${key}`, adminHint);
  }
  console.log(`sonar-local: quality gate ${gateName} (same as ${officialKey})`);

  const profiles = await api('GET', 'api/qualityprofiles/search', { project: officialKey });
  if (profiles.status !== 200) throw refused(`read the quality profiles of ${officialKey}`, `'Browse' on ${officialKey}`);
  for (const { language, name } of profiles.json.profiles) {
    const added = await api('POST', 'api/qualityprofiles/add_project', { project: key, language, qualityProfile: name });
    if (added.status >= 300) throw refused(`assign quality profile '${name}' (${language}) to ${key}`, adminHint);
  }
}

async function openIssues(api, key) {
  const issues = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    // issueStatuses is load-bearing: without it, issues fixed by an earlier run look open.
    const result = await api('GET', 'api/issues/search', {
      componentKeys: key, issueStatuses: 'OPEN,CONFIRMED', ps: PAGE_SIZE, p: page,
    });
    if (result.status !== 200) throw new Error(`can't read the issues of ${key} (HTTP ${result.status})`);
    issues.push(...result.json.issues);
    total = result.json.paging.total;
    if (page * PAGE_SIZE >= total) break;
  }
  return { total, issues };
}

// ---------- Build, tests, scanner ----------

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) throw new Error(`${command} ${args[0]} failed (exit ${result.status})`);
  return result.status;
}

// The one .sln or .slnx here or in a folder right below (api/); --solution when there are several.
function findSolution(given) {
  if (given) return given;
  const isSolution = (name) => /\.slnx?$/.test(name);
  const here = readdirSync('.').filter(isSolution);
  const below = readdirSync('.', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .flatMap((dir) => readdirSync(dir.name).filter(isSolution).map((name) => join(dir.name, name)));
  const found = here.length > 0 ? here : below;
  if (found.length !== 1) throw new Error(`found ${found.length} solutions; pass --solution <file>`);
  return found[0];
}

// begin -> build -> test -> end stays one sequence: the scanner instruments MSBuild.
function scan(solution, key, { hostUrl, token }) {
  rmSync(COVERAGE_DIR, { recursive: true, force: true });
  run('dotnet', [
    'sonarscanner', 'begin', `/k:${key}`, '/v:local',
    `/d:sonar.host.url=${hostUrl}`, `/d:sonar.token=${token}`, '/d:sonar.qualitygate.wait=true',
    `/d:sonar.cs.opencover.reportsPaths=${COVERAGE_DIR.replaceAll('\\', '/')}/**/coverage.opencover.xml`,
    `/d:sonar.exclusions=${EXCLUSIONS}`,
  ]);
  run('dotnet', ['build', solution, '--configuration', 'Release']);
  run('dotnet', [
    'test', solution, '--no-build', '--configuration', 'Release',
    '--collect', 'XPlat Code Coverage', '--results-directory', COVERAGE_DIR,
    '--', 'DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=opencover',
  ]);
  // qualitygate.wait makes `end` fail on a failed gate too; the gate status from the API tells them apart.
  return run('dotnet', ['sonarscanner', 'end', `/d:sonar.token=${token}`], { allowFailure: true });
}

// ---------- What this work changed ----------

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

// Committed on the branch, staged, unstaged and untracked: the analysis ran on the working tree.
function findMergeBase(base) {
  const mergeBase = (git(['merge-base', 'HEAD', `origin/${base}`]) ?? git(['merge-base', 'HEAD', base]))?.trim();
  if (!mergeBase) throw new Error(`can't find the base branch '${base}' (pass --base <branch or commit>)`);
  return mergeBase;
}

function changedLines(mergeBase) {
  const diff = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', mergeBase, '--']) ?? '';
  const untracked = (git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n').filter(Boolean);
  return parseChangedLines(diff, untracked);
}

// Unified diff (--unified=0) -> [{ file, start, end }] for every added or changed line range.
export function parseChangedLines(diff, untracked = []) {
  const ranges = [];
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.slice(4).replace(/^b\//, '');
    } else if (line.startsWith('@@ ') && file) {
      const [, start, count] = line.match(/\+(\d+)(?:,(\d+))?/);
      const n = count === undefined ? 1 : Number(count);
      if (n > 0) ranges.push({ file, start: Number(start), end: Number(start) + n - 1 });
    }
  }
  return [...ranges, ...untracked.map((file) => ({ file, start: 1, end: Infinity }))];
}

// An issue on a changed line is new from this work; one without a line is new when its file changed.
// Sonar paths are relative to the analysis root and git paths to the repo root, so a git path that ends
// with the Sonar path is the same file. Grouping uses MQR impacts, never the legacy type/severity.
export function classify(issues, changed, key) {
  const sameFile = (gitPath, sonarPath) => gitPath === sonarPath || gitPath.endsWith(`/${sonarPath}`);
  const withPath = issues.map((issue) => ({ ...issue, path: issue.component.replace(`${key}:`, '') }));
  const isNew = (issue) => changed.some((range) =>
    sameFile(range.file, issue.path) && (issue.line == null || (issue.line >= range.start && issue.line <= range.end)));
  const fresh = withPath.filter(isNew);
  const debt = withPath.filter((issue) => !isNew(issue));
  return {
    new: fresh
      .map(({ rule, path, line, message, impacts = [] }) => ({ rule, path, line, message, impacts, top: topImpact(impacts) }))
      .sort((a, b) => rank(a.top) - rank(b.top) || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0)),
    debtCount: debt.length,
    debtCountsByImpact: countsByImpact(debt),
    withoutImpacts: withPath.filter((issue) => !issue.impacts?.length).length,
  };
}

function rank(impact) {
  return impact ? (QUALITY_RANK[impact.softwareQuality] ?? 9) * 10 + (SEVERITY_RANK[impact.severity] ?? 9) : 99;
}

// The most severe impact: severity first, then software quality.
function topImpact(impacts) {
  const bySeverity = (i) => (SEVERITY_RANK[i.severity] ?? 9) * 10 + (QUALITY_RANK[i.softwareQuality] ?? 9);
  return [...impacts].sort((a, b) => bySeverity(a) - bySeverity(b))[0] ?? null;
}

// An issue with two impacts counts once under each.
function countsByImpact(issues) {
  const counts = new Map();
  for (const impact of issues.flatMap((issue) => issue.impacts ?? [])) {
    const label = `${impact.softwareQuality} / ${impact.severity}`;
    counts.set(label, { impact, count: (counts.get(label)?.count ?? 0) + 1 });
  }
  return [...counts.entries()]
    .sort(([, a], [, b]) => rank(a.impact) - rank(b.impact))
    .map(([label, { count }]) => ({ impact: label, count }));
}

export function formatReport(gate, classified, { key, totalOpen, mergeBase }) {
  const status = gate?.projectStatus?.status ?? 'NONE';
  const lines = [`sonar-local: quality gate (${key}): ${status} — a guide only; CI on the official project decides`];
  for (const c of gate?.projectStatus?.conditions ?? []) {
    lines.push(`  ${c.status}  ${c.metricKey} ${c.comparator} ${c.errorThreshold} (actual: ${c.actualValue ?? 'n/a'})`);
  }
  lines.push(`sonar-local: open issues: ${totalOpen} (diff base ${mergeBase.slice(0, 12)})`);
  lines.push(`sonar-local: NEW FROM THIS WORK: ${classified.new.length}`);
  for (const issue of classified.new) {
    const top = issue.top ? `${issue.top.softwareQuality}/${issue.top.severity}` : 'no impacts';
    const more = issue.impacts.length > 1
      ? `  [impacts: ${issue.impacts.map((i) => `${i.softwareQuality}/${i.severity}`).join(', ')}]` : '';
    lines.push(`  ${top}  ${issue.rule}  ${issue.path}:${issue.line ?? '-'}  ${issue.message}${more}`);
  }
  lines.push(`sonar-local: PRE-EXISTING DEBT: ${classified.debtCount} (counts by impact)`);
  for (const { impact, count } of classified.debtCountsByImpact) lines.push(`  ${impact}: ${count}`);
  if (classified.withoutImpacts > 0) {
    lines.push(`sonar-local: ${classified.withoutImpacts} issue(s) without impacts: check the server is in MQR Mode`);
  }
  return lines.join('\n');
}

// ---------- Run ----------

async function analyze({ officialKey, solution, base }) {
  if (!(await check(officialKey))) throw new Error(`fix what is MISSING above, then run again (the sonar skill says how)`);
  const secrets = loadSecrets();
  const api = sonarApi(secrets);
  const key = localKey(officialKey, process.env.SONAR_LOCAL_USER || git(['config', 'user.email'])?.trim());
  const sln = findSolution(solution);
  // Before the build: a wrong base would only show after minutes of analysis.
  const mergeBase = findMergeBase(base);
  await ensureLocalProject(api, officialKey, key);

  const endStatus = scan(sln, key, secrets);
  const gate = await api('GET', 'api/qualitygates/project_status', { projectKey: key });
  if (gate.status !== 200) throw new Error(`can't read the quality gate of ${key} (HTTP ${gate.status})`);
  const { total, issues } = await openIssues(api, key);
  const classified = classify(issues, changedLines(mergeBase), key);

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'quality-gate.json'), JSON.stringify(gate.json, null, 2));
  writeFileSync(join(REPORT_DIR, 'classified-issues.json'), JSON.stringify({ key, mergeBase, totalOpen: total, ...classified }, null, 2));
  console.log(formatReport(gate.json, classified, { key, totalOpen: total, mergeBase }));

  const status = gate.json.projectStatus.status;
  if (status === 'OK' && endStatus !== 0) throw new Error('sonarscanner end failed although the gate is OK: see the output above');
  return status === 'OK' ? 0 : 1;
}

// Last, so every constant above exists when it runs; the tests import this file without running it.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'setup') setup();
    else if (process.argv[2] === 'check') process.exitCode = (await check(process.argv[3])) ? 0 : 1;
    else process.exitCode = await analyze(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`sonar-local: ${error.message}`);
    process.exitCode = 1;
  }
}
