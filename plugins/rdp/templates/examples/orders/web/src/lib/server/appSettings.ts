// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// The BFF's configuration, read once when the server starts. Server only.
// Same convention as the .NET appsettings: one self-contained file per environment in web/config/
// (appsettings.json = local development; appsettings.HML.json / appsettings.PRD.json, chosen by APP_ENV),
// then environment variables override single keys with .NET's `__` form (Api__Url, ...).
// Errors name the keys, never their values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isObject } from './bff/isObject.ts';

const DEPLOYED_ENVIRONMENTS = ['HML', 'PRD'];

// The identity provider is kr-identity: `Authority` is its base address (the BFF calls `{Authority}/authorize`,
// `/oauth/token`, `/oauth/revoke`), and this BFF is registered there as the client `ClientId`, allowed `Scope`
// (`openid offline_access` + the API's).
export type AppSettings = {
  readonly apiUrl: string;
  readonly idpAuthority: string;
  readonly idpClientId: string;
  readonly idpScope: string;
  readonly authRedirectUri: string;
  // The header that carries the user's IP to the identity provider.
  readonly clientIpHeader: string;
  // The client secret (confidential client). Only from the environment (IdentityProvider__ClientSecret),
  // never in a committed file; required in HML and PRD. "" locally: a public client (PKCE only).
  readonly idpClientSecret: string;
};

export type Environment = Readonly<Record<string, string | undefined>>;

// Gives a config file's text, or undefined when there is no such file.
export type ReadConfigFile = (fileName: string) => string | undefined;

type Key = { readonly section: string; readonly name: string };

const KEYS = {
  apiUrl: { section: 'Api', name: 'Url' },
  idpAuthority: { section: 'IdentityProvider', name: 'Authority' },
  idpClientId: { section: 'IdentityProvider', name: 'ClientId' },
  idpScope: { section: 'IdentityProvider', name: 'Scope' },
  authRedirectUri: { section: 'IdentityProvider', name: 'RedirectUri' },
  clientIpHeader: { section: 'IdentityProvider', name: 'ClientIpHeader' },
  idpClientSecret: { section: 'IdentityProvider', name: 'ClientSecret' }
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
  const read = (key: Key, check = checkedUrl): string => {
    const value = environment[`${key.section}__${key.name}`] ?? valueIn(file, key);
    const setting = isPlaceholder(value) ? { problem: 'is still a TODO placeholder' } : check(value);
    if ('value' in setting) return setting.value;
    problems.push(`${key.section}:${key.name} ${setting.problem}`);
    return '';
  };
  const secretKey = KEYS.idpClientSecret;
  const secret = environment[`${secretKey.section}__${secretKey.name}`] ?? '';
  if (appEnv && secret === '') {
    problems.push(
      `${secretKey.section}:${secretKey.name} is missing (set ${secretKey.section}__${secretKey.name})`
    );
  }
  const settings: AppSettings = {
    apiUrl: read(KEYS.apiUrl),
    idpAuthority: read(KEYS.idpAuthority),
    idpClientId: read(KEYS.idpClientId, checkedText),
    idpScope: read(KEYS.idpScope, checkedText),
    authRedirectUri: read(KEYS.authRedirectUri),
    clientIpHeader: read(KEYS.clientIpHeader, checkedHeaderName),
    idpClientSecret: secret
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

function checkedUrl(value: unknown): { value: string } | { problem: string } {
  if (typeof value !== 'string' || value === '') return { problem: 'is missing' };
  return URL.canParse(value) ? { value: value.replace(/\/+$/, '') } : { problem: 'must be an absolute URL' };
}

// The committed HML and PRD files ship with TODO values for what only the project knows: the BFF refuses
// to start until they are filled in, instead of calling an address that doesn't exist.
function isPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && value.includes('TODO');
}

function checkedText(value: unknown): { value: string } | { problem: string } {
  return typeof value === 'string' && value.trim() !== '' ? { value } : { problem: 'is missing' };
}

// An HTTP header name (RFC 9110 token).
function checkedHeaderName(value: unknown): { value: string } | { problem: string } {
  if (typeof value !== 'string' || value === '') return { problem: 'is missing' };
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value) ? { value } : { problem: 'must be an HTTP header name' };
}

function parseFile(fileName: string, text: string | undefined): Readonly<Record<string, unknown>> {
  if (text === undefined) throw new Error(`config/${fileName} not found`);
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) return parsed;
  } catch {
    // JSON.parse's message can quote the file's text; say only which file.
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
