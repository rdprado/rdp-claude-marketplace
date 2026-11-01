// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_DEV_SESSION_SECRET,
  loadAppSettings,
  readFromConfigFolder,
  type ReadConfigFile
} from './appSettings.ts';

const REAL_SECRET = 'hml-secret-from-the-environment-file-0123456789';

// The committed files, read from web/config/ (Vitest runs in web/).
const committedFiles: ReadConfigFile = (fileName) =>
  readFileSync(join(process.cwd(), 'config', fileName), 'utf8');

// One in-memory file standing in for whichever appsettings file is asked for.
function fileWith(settings: object): ReadConfigFile {
  return () => JSON.stringify(settings);
}

const LOCAL = {
  Api: { Url: 'http://localhost:5180' },
  IdentityProvider: {
    Url: 'http://localhost:5180/dev-idp',
    RedirectUri: 'http://localhost:5173/auth/callback'
  },
  Session: { Secret: LOCAL_DEV_SESSION_SECRET }
};

function errorOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected an error');
}

describe('loadAppSettings', () => {
  it('loads the local appsettings.json when APP_ENV is unset', () => {
    // Act
    const settings = loadAppSettings({}, committedFiles);

    // Assert
    expect(settings).toEqual({
      apiUrl: 'http://localhost:5180',
      idpUrl: 'http://localhost:5180/dev-idp',
      authRedirectUri: 'http://localhost:5173/auth/callback',
      sessionSecret: LOCAL_DEV_SESSION_SECRET
    });
  });

  it('loads the HML file once Session__Secret comes from the environment', () => {
    // Act
    const settings = loadAppSettings({ APP_ENV: 'HML', Session__Secret: REAL_SECRET }, committedFiles);

    // Assert
    expect(settings.apiUrl).toBe('https://orders-api.hml.example.com');
    expect(settings.sessionSecret).toBe(REAL_SECRET);
  });

  it('refuses to start in HML with the committed empty secret', () => {
    // Act / Assert
    expect(() => loadAppSettings({ APP_ENV: 'HML' }, committedFiles)).toThrow(
      'Invalid configuration (config/appsettings.HML.json + environment): Session:Secret is missing'
    );
  });

  it('refuses to start in HML with the local development secret', () => {
    // Act / Assert
    expect(() =>
      loadAppSettings({ APP_ENV: 'HML', Session__Secret: LOCAL_DEV_SESSION_SECRET }, committedFiles)
    ).toThrow('Session:Secret is the public local development value');
  });

  it('lets an environment variable win over the file', () => {
    // Act
    const settings = loadAppSettings(
      { Api__Url: 'http://127.0.0.1:9000/', IdentityProvider__Url: 'http://127.0.0.1:9000/idp' },
      fileWith(LOCAL)
    );

    // Assert: the trailing slash is dropped
    expect(settings.apiUrl).toBe('http://127.0.0.1:9000');
    expect(settings.idpUrl).toBe('http://127.0.0.1:9000/idp');
  });

  it('an environment variable set but empty still wins, and fails as missing', () => {
    // Act / Assert: an empty variable is a deploy mistake; the file value must not hide it
    expect(() => loadAppSettings({ Api__Url: '' }, fileWith(LOCAL))).toThrow('Api:Url is missing');
  });

  it('refuses a value that is not an absolute URL', () => {
    // Act / Assert
    expect(() =>
      loadAppSettings({ IdentityProvider__RedirectUri: '/auth/callback' }, fileWith(LOCAL))
    ).toThrow('IdentityProvider:RedirectUri must be an absolute URL');
  });

  it('names every missing key', () => {
    // Act / Assert
    expect(() => loadAppSettings({}, fileWith({ Session: { Secret: LOCAL_DEV_SESSION_SECRET } }))).toThrow(
      'Api:Url is missing; IdentityProvider:Url is missing; IdentityProvider:RedirectUri is missing'
    );
  });

  it('refuses a secret shorter than 32 characters without printing it', () => {
    // Arrange
    const shortSecret = 'short-secret-value';

    // Act
    const message = errorOf(() => loadAppSettings({ Session__Secret: shortSecret }, fileWith(LOCAL)));

    // Assert
    expect(message).toContain('Session:Secret must be at least 32 characters');
    expect(message).not.toContain(shortSecret);
  });

  it('accepts a secret of exactly 32 characters', () => {
    // Arrange
    const secret = 'x'.repeat(32);

    // Act
    const settings = loadAppSettings({ Session__Secret: secret }, fileWith(LOCAL));

    // Assert
    expect(settings.sessionSecret).toBe(secret);
  });

  it('never prints the secret, even when the file is not valid JSON', () => {
    // Arrange: JSON.parse's own message would quote this text
    const broken: ReadConfigFile = () => `{ "Session": { "Secret": "${REAL_SECRET}" `;

    // Act
    const message = errorOf(() => loadAppSettings({ APP_ENV: 'PRD' }, broken));

    // Assert
    expect(message).toBe('config/appsettings.PRD.json is not a JSON object');
    expect(message).not.toContain(REAL_SECRET);
  });

  it('refuses an APP_ENV other than HML or PRD', () => {
    // Act / Assert
    expect(() => loadAppSettings({ APP_ENV: 'Production' }, committedFiles)).toThrow(
      'APP_ENV must be HML or PRD (unset for local development)'
    );
  });
});

describe('readFromConfigFolder', () => {
  it('reads a file from web/config/', () => {
    // Act
    const text = readFromConfigFolder('appsettings.json');

    // Assert
    expect(JSON.parse(text ?? '')).toHaveProperty('Api');
  });

  it('gives undefined when the file is not there', () => {
    // Act
    const text = readFromConfigFolder('appsettings.MISSING.json');

    // Assert
    expect(text).toBeUndefined();
  });

  it('fails on any other error, such as a folder where the file should be', () => {
    // Act
    const read = () => readFromConfigFolder('.');

    // Assert
    expect(read).toThrow();
  });
});
