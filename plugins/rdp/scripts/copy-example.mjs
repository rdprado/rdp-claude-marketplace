// Copies the RDP orders example's api/ or web/ into an empty project, named for the app:
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/copy-example.mjs" <api|web> <AppName> [--to <projectDir>]
// OrdersExample becomes <AppName> in paths and contents, orders-example becomes its kebab case, and the
// "Example code" header line goes; every other comment stays, because the comments hold the rules.
// Build output, dependencies and tool reports are left out. It never writes over a folder with files.
// RDP_EXAMPLE_DIR points it at another example folder (the tests use it).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARTS = ['api', 'web'];
const SKIPPED = new Set(['node_modules', 'bin', 'obj', '.metrics', '.svelte-kit', 'build', 'coverage', 'TestResults']);
const HEADER = 'Example code (RDP orders example)';

try {
  const { part, app, projectDir } = parseArgs(process.argv.slice(2));
  const target = join(projectDir, part);
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} already has files; the example is only copied into an empty project`);
  }
  const names = { OrdersExample: app, 'orders-example': kebab(app) };
  const count = copyFolder(join(exampleDir(), part), target, names);
  console.log(`Copied ${count} files of the orders example's ${part}/ to ${target} as ${app}.`);
  console.log('Next: commit this copy before any other change, so later diffs show only your work.');
} catch (error) {
  console.error(`copy-example: ${error.message}`);
  process.exit(1);
}

function parseArgs(args) {
  const [part, app] = args;
  const toAt = args.indexOf('--to');
  if (!PARTS.includes(part)) throw new Error('the first argument must be api or web');
  if (!/^[A-Z][A-Za-z0-9]*$/.test(app ?? '')) {
    throw new Error('the app name must be PascalCase, such as MarketPlace');
  }
  return { part, app, projectDir: resolve(toAt >= 0 ? args[toAt + 1] : process.cwd()) };
}

function exampleDir() {
  return process.env.RDP_EXAMPLE_DIR
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'examples', 'orders');
}

// MarketPlaceExperimentation → market-place-experimentation
function kebab(app) {
  return app.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function copyFolder(from, to, names) {
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const source = join(from, entry.name);
    const destination = join(to, rename(entry.name, names));
    if (entry.isDirectory()) {
      count += copyFolder(source, destination, names);
    } else {
      writeFileSync(destination, converted(readFileSync(source), names));
      count++;
    }
  }
  return count;
}

function rename(text, names) {
  return Object.entries(names).reduce((result, [from, to]) => result.replaceAll(from, to), text);
}

// Text gets the new names and loses the header line; a binary file (it has a zero byte) is copied as is.
function converted(bytes, names) {
  if (bytes.includes(0)) return bytes;
  const lines = bytes.toString('utf8').split('\n').filter((line) => !line.includes(HEADER));
  return rename(lines.join('\n'), names);
}
