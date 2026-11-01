// Unit tests for plugins/rdp/scripts/copy-example.mjs: copies into temp folders, then checks the result.
//   node --test tests/scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'plugins', 'rdp', 'scripts', 'copy-example.mjs');
const REAL_EXAMPLE = join(REPO, 'plugins', 'rdp', 'templates', 'examples', 'orders');
const HEADER = 'Example code (RDP orders example)';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'rdp-copy-example-'));
}

function run(args, env = {}) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

// Every file under dir, as paths relative to it.
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .map((path) => relative(dir, path).replaceAll('\\', '/'))
    .sort();
}

// A small example with every case the script handles.
function fixtureExample() {
  const dir = tempDir();
  write(join(dir, 'api', 'OrdersExample.slnx'), '<Project Path="src/OrdersExample.Api/OrdersExample.Api.csproj" />\n');
  write(
    join(dir, 'api', 'src', 'OrdersExample.Api', 'Program.cs'),
    `// ${HEADER}: a placeholder. Change it or delete it to fit your project.\nnamespace OrdersExample.Api;\n// Keep this rule.\n`
  );
  write(join(dir, 'api', 'src', 'OrdersExample.Api', 'appsettings.json'), '{ "FilePath": "C:/logs/orders-example/log.txt" }\n');
  write(join(dir, 'api', 'src', 'OrdersExample.Api', 'bin', 'Debug', 'OrdersExample.Api.dll'), 'built');
  write(join(dir, 'api', 'src', 'OrdersExample.Api', 'obj', 'project.assets.json'), '{}');
  write(join(dir, 'web', 'package.json'), '{ "name": "orders-example-web" }\n');
  write(
    join(dir, 'web', 'src', 'routes', '+page.svelte'),
    `<!-- ${HEADER}: a placeholder. Change it or delete it to fit your project. -->\n<h1>OrdersExample</h1>\n`
  );
  write(join(dir, 'web', 'node_modules', 'pino', 'index.js'), 'module.exports = {};');
  write(join(dir, 'web', '.metrics', 'crap.edn'), '{}');
  write(join(dir, 'web', 'static', 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x4f, 0x72, 0x64, 0x65, 0x72, 0x73]));
  return dir;
}

function copy(part, app, env) {
  const project = tempDir();
  const result = run([part, app, '--to', project], env);
  return { project, result };
}

test('copies api/ with OrdersExample renamed in names, paths and contents', () => {
  const example = fixtureExample();
  const { project, result } = copy('api', 'MarketPlace', { RDP_EXAMPLE_DIR: example });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(filesUnder(join(project, 'api')), [
    'MarketPlace.slnx',
    'src/MarketPlace.Api/Program.cs',
    'src/MarketPlace.Api/appsettings.json',
  ]);
  assert.equal(
    readFileSync(join(project, 'api', 'MarketPlace.slnx'), 'utf8'),
    '<Project Path="src/MarketPlace.Api/MarketPlace.Api.csproj" />\n'
  );
  assert.equal(
    readFileSync(join(project, 'api', 'src', 'MarketPlace.Api', 'appsettings.json'), 'utf8'),
    '{ "FilePath": "C:/logs/market-place/log.txt" }\n'
  );
});

test('drops the "Example code" header line and keeps every other comment', () => {
  const example = fixtureExample();
  const { project } = copy('api', 'MarketPlace', { RDP_EXAMPLE_DIR: example });

  assert.equal(
    readFileSync(join(project, 'api', 'src', 'MarketPlace.Api', 'Program.cs'), 'utf8'),
    'namespace MarketPlace.Api;\n// Keep this rule.\n'
  );
});

test('copies web/ with the HTML-comment header dropped and the package renamed in kebab case', () => {
  const example = fixtureExample();
  const { project, result } = copy('web', 'MarketPlaceExperimentation', { RDP_EXAMPLE_DIR: example });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(project, 'web', 'package.json'), 'utf8'),
    '{ "name": "market-place-experimentation-web" }\n'
  );
  assert.equal(
    readFileSync(join(project, 'web', 'src', 'routes', '+page.svelte'), 'utf8'),
    '<h1>MarketPlaceExperimentation</h1>\n'
  );
});

test('leaves out build output, dependencies and tool reports', () => {
  const example = fixtureExample();
  const { project } = copy('web', 'MarketPlace', { RDP_EXAMPLE_DIR: example });

  assert.equal(existsSync(join(project, 'web', 'node_modules')), false);
  assert.equal(existsSync(join(project, 'web', '.metrics')), false);
});

test('copies a binary file byte for byte', () => {
  const example = fixtureExample();
  const { project } = copy('web', 'MarketPlace', { RDP_EXAMPLE_DIR: example });

  assert.deepEqual(
    readFileSync(join(project, 'web', 'static', 'logo.png')),
    readFileSync(join(example, 'web', 'static', 'logo.png'))
  );
});

test('refuses to copy over a folder that already has files, and changes nothing', () => {
  const example = fixtureExample();
  const project = tempDir();
  write(join(project, 'web', 'package.json'), 'mine');

  const result = run(['web', 'MarketPlace', '--to', project], { RDP_EXAMPLE_DIR: example });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already has files/);
  assert.equal(readFileSync(join(project, 'web', 'package.json'), 'utf8'), 'mine');
});

test('rejects a part other than api or web', () => {
  const result = run(['mobile', 'MarketPlace', '--to', tempDir()]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /api or web/);
});

test('rejects an app name that is not PascalCase', () => {
  for (const name of ['marketPlace', 'Market-Place', 'Market Place', '9Market', '']) {
    const result = run(['api', name, '--to', tempDir()]);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /PascalCase/, name);
  }
});

test('says to commit the copy next', () => {
  const { result } = copy('api', 'MarketPlace', { RDP_EXAMPLE_DIR: fixtureExample() });

  assert.match(result.stdout, /commit/i);
});

// The real example: nothing of OrdersExample or the header may survive the copy.
for (const part of ['api', 'web']) {
  test(`copies the real ${part}/ with no OrdersExample, orders-example or header left`, () => {
    const { project, result } = copy(part, 'MarketPlace');

    assert.equal(result.status, 0, result.stderr);
    const copied = join(project, part);
    const leftovers = filesUnder(copied).filter((file) => {
      const text = readFileSync(join(copied, file), 'utf8');
      return /OrdersExample|orders-example/.test(file + text) || text.includes(HEADER);
    });
    assert.deepEqual(leftovers, []);
  });
}
