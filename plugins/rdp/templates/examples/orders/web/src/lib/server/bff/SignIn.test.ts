// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SignIn } from './SignIn.ts';
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
  testSessionCookie,
  testSignInCookie
} from './testing/fakes.ts';

const REDIRECT_URI = 'https://app.example/auth/callback';
const NOW = new Date('2026-10-28T12:00:00Z');
const ACCESS = accessTokenFor('user-1');

function fakeIdentityProvider(exchange: () => Promise<TokenResult>): IdentityProviderClient {
  return {
    authorizeUrl: (request) =>
      `https://idp.example/authorize?state=${request.state}&code_challenge=${request.codeChallenge}`,
    exchangeCode: vi.fn(exchange),
    refresh: vi.fn(),
    revoke: vi.fn()
  };
}

const issued = (): Promise<TokenResult> =>
  Promise.resolve({
    kind: 'issued',
    tokens: { accessToken: ACCESS, refreshToken: 'refresh-1', expiresInSeconds: 300 }
  });

// Starts a sign-in and returns the state the provider would echo back.
function startSignIn(signIn: SignIn, cookies: FakeCookieJar): string {
  const location = new URL(signIn.start(cookies));
  return location.searchParams.get('state') ?? '';
}

describe('SignIn', () => {
  it('sends the browser to the provider with a state and the S256 challenge of the stored verifier', () => {
    // Arrange
    const cookies = new FakeCookieJar();
    const signIn = new SignIn(
      fakeIdentityProvider(issued),
      testSessionCookie,
      testSignInCookie,
      new ManualClock(NOW),
      new RecordingLogger(),
      REDIRECT_URI
    );

    // Act
    const location = new URL(signIn.start(cookies));

    // Assert
    const attempt = testSignInCookie.read(cookies) ?? { state: '', codeVerifier: '' };
    expect(location.searchParams.get('state')).toBe(attempt.state);
    expect(attempt.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(attempt.codeVerifier).digest('base64url')
    );
    expect(cookies.options.get('bff_signin')).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/callback'
    });
  });

  it('sets the session cookie HttpOnly + Secure + SameSite on a valid code', async () => {
    // Arrange
    const cookies = new FakeCookieJar();
    const logger = new RecordingLogger();
    const signIn = new SignIn(
      fakeIdentityProvider(issued),
      testSessionCookie,
      testSignInCookie,
      new ManualClock(NOW),
      logger,
      REDIRECT_URI
    );
    const state = startSignIn(signIn, cookies);

    // Act
    const outcome = await signIn.complete(cookies, { code: 'good-code', state }, 'trace-1');

    // Assert
    expect(outcome).toBe('signed-in');
    expect(testSessionCookie.read(cookies)).toEqual({
      accessToken: ACCESS,
      refreshToken: 'refresh-1',
      expiresAt: NOW.getTime() + 300_000
    });
    expect(cookies.options.get('bff_session')).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax'
    });
    expect(cookies.get('bff_signin')).toBeUndefined();
    expect(logger.find('signin.ok')?.fields).toEqual({ userId: 'user-1', traceId: 'trace-1' });
  });

  it('exchanges the code with the redirect uri and the verifier it stored', async () => {
    // Arrange
    const cookies = new FakeCookieJar();
    const identityProvider = fakeIdentityProvider(issued);
    const signIn = new SignIn(
      identityProvider,
      testSessionCookie,
      testSignInCookie,
      new ManualClock(NOW),
      new RecordingLogger(),
      REDIRECT_URI
    );
    const state = startSignIn(signIn, cookies);
    const verifier = testSignInCookie.read(cookies)?.codeVerifier;

    // Act
    await signIn.complete(cookies, { code: 'good-code', state }, 'trace-1');

    // Assert
    expect(identityProvider.exchangeCode).toHaveBeenCalledWith({
      code: 'good-code',
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier
    });
  });

  it('sets no session cookie and logs invalid_code when the provider rejects the code', async () => {
    // Arrange
    const cookies = new FakeCookieJar();
    const logger = new RecordingLogger();
    const signIn = new SignIn(
      fakeIdentityProvider(() => Promise.resolve({ kind: 'rejected' })),
      testSessionCookie,
      testSignInCookie,
      new ManualClock(NOW),
      logger,
      REDIRECT_URI
    );
    const state = startSignIn(signIn, cookies);

    // Act
    const outcome = await signIn.complete(cookies, { code: 'bad-code', state }, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(logger.find('signin.failed')).toEqual({
      level: 'warn',
      event: 'signin.failed',
      fields: { reason: 'invalid_code', traceId: 'trace-1' }
    });
    expect(logger.serialized()).not.toContain('bad-code');
  });

  it.each([
    ['the state does not match', 'other-state', 'invalid_state'],
    ['the code is missing', null, 'invalid_code']
  ])('refuses without calling the provider when %s', async (_, override, reason) => {
    // Arrange
    const cookies = new FakeCookieJar();
    const logger = new RecordingLogger();
    const identityProvider = fakeIdentityProvider(issued);
    const signIn = new SignIn(
      identityProvider,
      testSessionCookie,
      testSignInCookie,
      new ManualClock(NOW),
      logger,
      REDIRECT_URI
    );
    const state = startSignIn(signIn, cookies);
    const callback = override === null ? { code: null, state } : { code: 'good-code', state: override };

    // Act
    const outcome = await signIn.complete(cookies, callback, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(identityProvider.exchangeCode).not.toHaveBeenCalled();
    expect(logger.find('signin.failed')?.fields.reason).toBe(reason);
  });

  it('logs expired when the sign-in cookie is gone', async () => {
    // Arrange
    const logger = new RecordingLogger();
    const signIn = new SignIn(
      fakeIdentityProvider(issued),
      testSessionCookie,
      testSignInCookie,
      new ManualClock(NOW),
      logger,
      REDIRECT_URI
    );

    // Act
    const outcome = await signIn.complete(new FakeCookieJar(), { code: 'good-code', state: 's' }, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(logger.find('signin.failed')?.fields.reason).toBe('expired');
  });

  it('logs idp.unavailable and idp_down when the provider is down', async () => {
    // Arrange
    const cookies = new FakeCookieJar();
    const logger = new RecordingLogger();
    const signIn = new SignIn(
      fakeIdentityProvider(() => Promise.reject(new IdentityProviderUnavailableError())),
      testSessionCookie,
      testSignInCookie,
      new ManualClock(NOW),
      logger,
      REDIRECT_URI
    );
    const state = startSignIn(signIn, cookies);

    // Act
    const outcome = await signIn.complete(cookies, { code: 'good-code', state }, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(logger.find('idp.unavailable')?.level).toBe('error');
    expect(logger.find('signin.failed')?.fields.reason).toBe('idp_down');
  });
});
