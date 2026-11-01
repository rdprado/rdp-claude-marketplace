// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it, vi } from 'vitest';
import { SessionRefresher } from './SessionRefresher.ts';
import {
  IdentityProviderUnavailableError,
  type IdentityProviderClient,
  type TokenResult
} from './ports/IdentityProviderClient.ts';
import {
  FakeCookieJar,
  ManualClock,
  RecordingLogger,
  accessTokenFor,
  testSessionCookie
} from './testing/fakes.ts';

const NOW = new Date('2026-10-28T12:00:00Z');
const OLD_ACCESS = accessTokenFor('user-1', 'old');
const NEW_ACCESS = accessTokenFor('user-1', 'new');

function identityProviderAnswering(refresh: (token: string) => Promise<TokenResult>) {
  const fake = { authorizeUrl: vi.fn(), exchangeCode: vi.fn(), refresh: vi.fn(refresh), revoke: vi.fn() };
  return fake satisfies IdentityProviderClient;
}

const rotates = (): Promise<TokenResult> =>
  Promise.resolve({
    kind: 'issued',
    tokens: { accessToken: NEW_ACCESS, refreshToken: 'refresh-2', expiresInSeconds: 300 }
  });

// A cookie whose access token expires `msLeft` after NOW.
function cookiesExpiringIn(msLeft: number): FakeCookieJar {
  const cookies = new FakeCookieJar();
  testSessionCookie.write(cookies, {
    accessToken: OLD_ACCESS,
    refreshToken: 'refresh-1',
    expiresAt: NOW.getTime() + msLeft
  });
  return cookies;
}

describe('SessionRefresher', () => {
  it('uses the current token without renewing while it has more than 30 s left', async () => {
    // Arrange
    const identityProvider = identityProviderAnswering(rotates);
    const refresher = new SessionRefresher(
      identityProvider,
      testSessionCookie,
      new ManualClock(NOW),
      new RecordingLogger()
    );

    // Act
    const lookup = await refresher.current(cookiesExpiringIn(30_001), 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'active', session: { accessToken: OLD_ACCESS, userId: 'user-1' } });
    expect(identityProvider.refresh).not.toHaveBeenCalled();
  });

  it('renews at the 30 s boundary and writes the rotated cookie', async () => {
    // Arrange
    const cookies = cookiesExpiringIn(30_000);
    const logger = new RecordingLogger();
    const refresher = new SessionRefresher(
      identityProviderAnswering(rotates),
      testSessionCookie,
      new ManualClock(NOW),
      logger
    );

    // Act
    const lookup = await refresher.current(cookies, 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'active', session: { accessToken: NEW_ACCESS, userId: 'user-1' } });
    expect(testSessionCookie.read(cookies)).toEqual({
      accessToken: NEW_ACCESS,
      refreshToken: 'refresh-2',
      expiresAt: NOW.getTime() + 300_000
    });
    expect(logger.find('refresh.ok')).toEqual({
      level: 'info',
      event: 'refresh.ok',
      fields: { userId: 'user-1', traceId: 'trace-1' }
    });
  });

  it('clears the cookie and reports no session when the renewal is rejected', async () => {
    // Arrange
    const cookies = cookiesExpiringIn(0);
    const logger = new RecordingLogger();
    const refresher = new SessionRefresher(
      identityProviderAnswering(() => Promise.resolve({ kind: 'rejected' })),
      testSessionCookie,
      new ManualClock(NOW),
      logger
    );

    // Act
    const lookup = await refresher.current(cookies, 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'none' });
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(logger.find('refresh.failed')?.fields).toEqual({
      reason: 'revoked',
      userId: 'user-1',
      traceId: 'trace-1'
    });
  });

  it('renews only once for two requests that arrive together', async () => {
    // Arrange
    const identityProvider = identityProviderAnswering(rotates);
    const refresher = new SessionRefresher(
      identityProvider,
      testSessionCookie,
      new ManualClock(NOW),
      new RecordingLogger()
    );
    const first = cookiesExpiringIn(0);
    const second = first.copy();

    // Act
    const lookups = await Promise.all([refresher.current(first, 't-1'), refresher.current(second, 't-2')]);

    // Assert
    expect(identityProvider.refresh).toHaveBeenCalledTimes(1);
    expect(lookups.map((l) => (l.kind === 'active' ? l.session.accessToken : l.kind))).toEqual([
      NEW_ACCESS,
      NEW_ACCESS
    ]);
    expect(testSessionCookie.read(second)?.refreshToken).toBe('refresh-2');
  });

  it('gives the renewed session to a late request with the old cookie within the 5 s grace', async () => {
    // Arrange
    const clock = new ManualClock(NOW);
    const identityProvider = identityProviderAnswering(rotates);
    const refresher = new SessionRefresher(identityProvider, testSessionCookie, clock, new RecordingLogger());
    const first = cookiesExpiringIn(0);
    const late = first.copy();
    await refresher.current(first, 't-1');
    clock.advance(5_000);

    // Act
    const lookup = await refresher.current(late, 't-2');

    // Assert
    expect(lookup.kind === 'active' && lookup.session.accessToken).toBe(NEW_ACCESS);
    expect(identityProvider.refresh).toHaveBeenCalledTimes(1);
  });

  it('logs refresh.reused as an error, without the token, when a rotated token comes back after the 5 s grace', async () => {
    // Arrange
    const clock = new ManualClock(NOW);
    const logger = new RecordingLogger();
    // Like the real provider: refresh-1 works once, then it has been rotated.
    let used = false;
    const identityProvider = identityProviderAnswering(() => {
      if (used) return Promise.resolve({ kind: 'rejected' });
      used = true;
      return rotates();
    });
    const refresher = new SessionRefresher(identityProvider, testSessionCookie, clock, logger);
    const first = cookiesExpiringIn(0);
    const replayed = first.copy();
    await refresher.current(first, 't-1');
    clock.advance(5_001);

    // Act
    const lookup = await refresher.current(replayed, 't-2');

    // Assert
    expect(lookup).toEqual({ kind: 'none' });
    expect(logger.find('refresh.reused')).toEqual({
      level: 'error',
      event: 'refresh.reused',
      fields: { userId: 'user-1', traceId: 't-2' }
    });
    expect(logger.serialized()).not.toContain('refresh-1');
    expect(logger.serialized()).not.toContain(OLD_ACCESS);
  });

  it.each([
    ['still remembers', 24 * 60 * 60_000, 'refresh.reused'],
    ['has forgotten', 24 * 60 * 60_000 + 1, 'refresh.failed']
  ])('%s a rotated token %i ms later', async (_, later, event) => {
    // Arrange
    const clock = new ManualClock(NOW);
    const logger = new RecordingLogger();
    let used = false;
    const identityProvider = identityProviderAnswering(() => {
      if (used) return Promise.resolve({ kind: 'rejected' });
      used = true;
      return rotates();
    });
    const refresher = new SessionRefresher(identityProvider, testSessionCookie, clock, logger);
    const first = cookiesExpiringIn(0);
    const replayed = first.copy();
    await refresher.current(first, 't-1');
    clock.advance(later);

    // Act
    await refresher.current(replayed, 't-2');

    // Assert
    expect(logger.find(event)).toBeDefined();
  });

  it('keeps the cookie and reports unavailable when the provider is down', async () => {
    // Arrange
    const cookies = cookiesExpiringIn(0);
    const logger = new RecordingLogger();
    const refresher = new SessionRefresher(
      identityProviderAnswering(() => Promise.reject(new IdentityProviderUnavailableError())),
      testSessionCookie,
      new ManualClock(NOW),
      logger
    );

    // Act
    const lookup = await refresher.current(cookies, 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'unavailable' });
    expect(testSessionCookie.read(cookies)?.refreshToken).toBe('refresh-1');
    expect(logger.find('idp.unavailable')?.level).toBe('error');
    expect(logger.find('refresh.failed')?.fields.reason).toBe('idp_down');
  });

  it('reports no session when there is no cookie', async () => {
    // Arrange
    const refresher = new SessionRefresher(
      identityProviderAnswering(rotates),
      testSessionCookie,
      new ManualClock(NOW),
      new RecordingLogger()
    );

    // Act
    const lookup = await refresher.current(new FakeCookieJar(), 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'none' });
  });
});
