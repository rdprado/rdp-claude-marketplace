// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Composition root — the BFF's configuration, read once when the server starts. Server only.
// Same convention as the .NET appsettings: one self-contained file per environment in web/config/
// (appsettings.json = local development; appsettings.HML.json / appsettings.PRD.json, chosen by APP_ENV),
// then environment variables override single keys with .NET's `__` form (Session__Secret, Api__Url, ...).
// Secrets are "" in the committed files: the real values arrive as environment variables (today the
// host's systemd EnvironmentFile, later the cloud secret store) with no code change. The local file's
// Session.Secret is public; outside local development the BFF refuses to start with it or with "".
// Errors name the keys, never their values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isObject } from './bff/isObject.ts';

export const LOCAL_DEV_SESSION_SECRET = 'local-dev-only-change-me-not-a-real-secret-0000';
const MIN_SECRET_LENGTH = 32;
const DEPLOYED_ENVIRONMENTS = ['HML', 'PRD'];

export type AppSettings = {
  readonly apiUrl: string;
  readonly idpUrl: string;
  readonly authRedirectUri: string;
  readonly sessionSecret: string;
};

export type Environment = Readonly<Record<string, string | undefined>>;

// Gives a config file's text, or undefined when there is no such file.
export type ReadConfigFile = (fileName: string) => string | undefined;

type Key = { readonly section: string; readonly name: string; readonly url: boolean };

const KEYS = {
  apiUrl: { section: 'Api', name: 'Url', url: true },
  idpUrl: { section: 'IdentityProvider', name: 'Url', url: true },
  authRedirectUri: { section: 'IdentityProvider', name: 'RedirectUri', url: true },
  sessionSecret: { section: 'Session', name: 'Secret', url: false }
} as const satisfies Record<keyof AppSettings, Key>;

// The real thing: process.env and web/config/ (relative to the working directory the server starts in).
export function readAppSettings(): AppSettings {
  return loadAppSettings(process.env, readFromConfigFolder);
}

export function loadAppSettings(environment: Environment, readConfigFile: ReadConfigFile): AppSettings {
  const appEnv = deployedEnvironment(environment);
  const fileName = appEnv ? `appsettings.${appEnv}.json` : 'appsettings.json';
  const file = parseFile(fileName, readConfigFile(fileName));

  // Every key is read before failing, so one error names every bad key.
  const problems: string[] = [];
  const read = (key: Key): string => {
    const setting = checked(
      key,
      environment[`${key.section}__${key.name}`] ?? valueIn(file, key),
      appEnv !== undefined
    );
    if ('value' in setting) return setting.value;
    problems.push(`${key.section}:${key.name} ${setting.problem}`);
    return '';
  };
  const settings: AppSettings = {
    apiUrl: read(KEYS.apiUrl),
    idpUrl: read(KEYS.idpUrl),
    authRedirectUri: read(KEYS.authRedirectUri),
    sessionSecret: read(KEYS.sessionSecret)
  };
  if (problems.length > 0) {
    throw new Error(`Invalid configuration (config/${fileName} + environment): ${problems.join('; ')}`);
  }
  return settings;
}

// HML or PRD, or undefined for local development.
function deployedEnvironment(environment: Environment): string | undefined {
  const appEnv = environment['APP_ENV'] || undefined;
  if (appEnv !== undefined && !DEPLOYED_ENVIRONMENTS.includes(appEnv)) {
    throw new Error('APP_ENV must be HML or PRD (unset for local development)');
  }
  return appEnv;
}

function checked(key: Key, value: unknown, deployed: boolean): { value: string } | { problem: string } {
  if (typeof value !== 'string' || value === '') return { problem: 'is missing' };
  if (key.url) {
    return URL.canParse(value)
      ? { value: value.replace(/\/+$/, '') }
      : { problem: 'must be an absolute URL' };
  }
  if (value.length < MIN_SECRET_LENGTH)
    return { problem: `must be at least ${MIN_SECRET_LENGTH} characters` };
  if (deployed && value === LOCAL_DEV_SESSION_SECRET)
    return { problem: 'is the public local development value' };
  return { value };
}

function parseFile(fileName: string, text: string | undefined): Readonly<Record<string, unknown>> {
  if (text === undefined) throw new Error(`config/${fileName} not found`);
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) return parsed;
  } catch {
    // JSON.parse's message can quote the file's text (a secret); say only which file.
  }
  throw new Error(`config/${fileName} is not a JSON object`);
}

function valueIn(file: Readonly<Record<string, unknown>>, key: Key): unknown {
  const section = file[key.section];
  return isObject(section) ? section[key.name] : undefined;
}

export function readFromConfigFolder(fileName: string): string | undefined {
  try {
    return readFileSync(join(process.cwd(), 'config', fileName), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
