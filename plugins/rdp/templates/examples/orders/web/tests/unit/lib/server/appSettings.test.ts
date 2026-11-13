// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadAppSettings,
  readFromConfigFolder,
  type ReadConfigFile
} from '../../../../src/lib/server/appSettings.ts';

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
    Authority: 'http://localhost:5180/dev-idp',
    ClientId: 'orders-example-web',
    Scope: 'openid offline_access orders-example-api',
    RedirectUri: 'http://localhost:5173/auth/callback',
    ClientIpHeader: 'X-End-User-IP'
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
      idpAuthority: 'http://localhost:5180/dev-idp',
      idpClientId: 'orders-example-web',
      idpScope: 'openid offline_access orders-example-api',
      authRedirectUri: 'http://localhost:5173/auth/callback',
      clientIpHeader: 'X-End-User-IP',
      idpClientSecret: ''
    });
  });

  it.each([['HML'], ['PRD']])(
    'the committed %s file refuses to start until its TODO values and the secret are set',
    (appEnv) => {
      // Act
      const message = errorOf(() => loadAppSettings({ APP_ENV: appEnv }, committedFiles));

      // Assert
      expect(message).toContain('Api:Url is still a TODO placeholder');
      expect(message).toContain('IdentityProvider:ClientId is still a TODO placeholder');
      expect(message).toContain(
        'IdentityProvider:ClientSecret is missing (set IdentityProvider__ClientSecret)'
      );
    }
  );

  it('loads a deployed file once filled in, with the secret from the environment', () => {
    // Act
    const settings = loadAppSettings(
      { APP_ENV: 'HML', IdentityProvider__ClientSecret: 'from-the-environment' },
      fileWith(LOCAL)
    );

    // Assert
    expect(settings.idpClientSecret).toBe('from-the-environment');
  });

  it('never reads the secret from the file', () => {
    // Act
    const settings = loadAppSettings(
      {},
      fileWith({ ...LOCAL, IdentityProvider: { ...LOCAL.IdentityProvider, ClientSecret: 'in-a-file' } })
    );

    // Assert
    expect(settings.idpClientSecret).toBe('');
  });

  it('lets an environment variable win over the file', () => {
    // Act
    const settings = loadAppSettings(
      { Api__Url: 'http://127.0.0.1:9000/', IdentityProvider__Authority: 'http://127.0.0.1:9000/idp' },
      fileWith(LOCAL)
    );

    // Assert: the trailing slash is dropped
    expect(settings.apiUrl).toBe('http://127.0.0.1:9000');
    expect(settings.idpAuthority).toBe('http://127.0.0.1:9000/idp');
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

  it('refuses a ClientIpHeader that is not an HTTP header name', () => {
    // Act / Assert
    expect(() =>
      loadAppSettings({ IdentityProvider__ClientIpHeader: 'End User IP' }, fileWith(LOCAL))
    ).toThrow('IdentityProvider:ClientIpHeader must be an HTTP header name');
  });

  it('names every missing key', () => {
    // Act / Assert
    expect(() => loadAppSettings({}, fileWith({}))).toThrow(
      'Api:Url is missing; IdentityProvider:Authority is missing; IdentityProvider:ClientId is missing; ' +
        'IdentityProvider:Scope is missing; IdentityProvider:RedirectUri is missing; ' +
        'IdentityProvider:ClientIpHeader is missing'
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
