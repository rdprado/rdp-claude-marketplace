// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it, vi } from 'vitest';
import { SignOut } from './SignOut.ts';
import {
  IdentityProviderUnavailableError,
  type IdentityProviderClient
} from './ports/IdentityProviderClient.ts';
import { FakeCookieJar, RecordingLogger, accessTokenFor, testSessionCookie } from './testing/fakes.ts';

function identityProviderRevoking(revoke: () => Promise<void>) {
  const fake = { authorizeUrl: vi.fn(), exchangeCode: vi.fn(), refresh: vi.fn(), revoke: vi.fn(revoke) };
  return fake satisfies IdentityProviderClient;
}

function signedInCookies(): FakeCookieJar {
  const cookies = new FakeCookieJar();
  testSessionCookie.write(cookies, {
    accessToken: accessTokenFor('user-1'),
    refreshToken: 'refresh-1',
    expiresAt: 0
  });
  return cookies;
}

describe('SignOut', () => {
  it('revokes the refresh token and clears the session cookie', async () => {
    // Arrange
    const cookies = signedInCookies();
    const logger = new RecordingLogger();
    const identityProvider = identityProviderRevoking(() => Promise.resolve());

    // Act
    await new SignOut(identityProvider, testSessionCookie, logger).run(cookies, 'trace-1');

    // Assert
    expect(identityProvider.revoke).toHaveBeenCalledWith('refresh-1');
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(logger.find('signout')?.fields).toEqual({ userId: 'user-1', revoked: true, traceId: 'trace-1' });
    expect(logger.serialized()).not.toContain('refresh-1');
  });

  it('still clears the cookie and logs revoked false when the provider is down', async () => {
    // Arrange
    const cookies = signedInCookies();
    const logger = new RecordingLogger();
    const identityProvider = identityProviderRevoking(() =>
      Promise.reject(new IdentityProviderUnavailableError())
    );

    // Act
    await new SignOut(identityProvider, testSessionCookie, logger).run(cookies, 'trace-1');

    // Assert
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(logger.find('signout')?.fields.revoked).toBe(false);
    expect(logger.find('idp.unavailable')?.level).toBe('error');
  });

  it('does not call the provider when there is no session', async () => {
    // Arrange
    const logger = new RecordingLogger();
    const identityProvider = identityProviderRevoking(() => Promise.resolve());

    // Act
    await new SignOut(identityProvider, testSessionCookie, logger).run(new FakeCookieJar(), 'trace-1');

    // Assert
    expect(identityProvider.revoke).not.toHaveBeenCalled();
    expect(logger.find('signout')?.fields.revoked).toBe(false);
  });
});
