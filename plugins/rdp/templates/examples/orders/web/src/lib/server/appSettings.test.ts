// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAppSettings, readFromConfigFolder, type ReadConfigFile } from './appSettings.ts';

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
  }
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
      authRedirectUri: 'http://localhost:5173/auth/callback'
    });
  });

  it('loads the HML file when APP_ENV is HML', () => {
    // Act
    const settings = loadAppSettings({ APP_ENV: 'HML' }, committedFiles);

    // Assert
    expect(settings.apiUrl).toBe('https://orders-api.hml.example.com');
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
    expect(() => loadAppSettings({}, fileWith({}))).toThrow(
      'Api:Url is missing; IdentityProvider:Url is missing; IdentityProvider:RedirectUri is missing'
    );
  });

  it('names only the file, not its text, when the file is not valid JSON', () => {
    // Arrange: JSON.parse's own message would quote this text
    const broken: ReadConfigFile = () => '{ "Api": { "Url": "http://text-from-the-file" ';

    // Act
    const message = errorOf(() => loadAppSettings({ APP_ENV: 'PRD' }, broken));

    // Assert
    expect(message).toBe('config/appsettings.PRD.json is not a JSON object');
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
