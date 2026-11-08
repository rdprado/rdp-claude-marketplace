// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { createAuth, pkceChallenge, userIdOf, type CsrfCheck, type Fetch, type Session } from './auth.ts';
import {
  accessTokenFor,
  fakeCookieJar,
  manualClock,
  recordingLogger,
  type FakeCookieJar
} from './testing/fakes.ts';

const IDP = 'https://idp.example';
const REDIRECT_URI = 'https://app.example/auth/callback';
const NOW = new Date('2026-10-28T12:00:00Z');
const ACCESS = accessTokenFor('user-1');
const OLD_ACCESS = accessTokenFor('user-1', 'old');
const NEW_ACCESS = accessTokenFor('user-1', 'new');
const BASE64URL_ID = /^[A-Za-z0-9_-]{43}$/;

// ---------- A fake identity provider: a fetch that records each call and answers it ----------

type IdpCall = { readonly path: string; readonly form: URLSearchParams };

function fakeIdentityProvider(answer: (call: IdpCall) => Promise<Response>) {
  const calls: IdpCall[] = [];
  const fetch: Fetch = (url, init) => {
    const call = { path: new URL(url).pathname, form: new URLSearchParams(String(init.body)) };
    calls.push(call);
    return answer(call);
  };
  return { fetch, calls };
}

const tokens = (accessToken: string, refreshToken: string) => () =>
  Promise.resolve(Response.json({ access_token: accessToken, refresh_token: refreshToken, expires_in: 300 }));
const issued = tokens(ACCESS, 'refresh-1');
const rotates = tokens(NEW_ACCESS, 'refresh-2');
const rejects = () => Promise.resolve(Response.json({ error: 'invalid_grant' }, { status: 400 }));
const down = () => Promise.reject(new TypeError('fetch failed'));

// Like the real provider: refresh-1 works once, then it has been rotated.
function rotatesOnce() {
  let used = false;
  return () => {
    if (used) return rejects();
    used = true;
    return rotates();
  };
}

function setup(answer: (call: IdpCall) => Promise<Response>, sessions = new Map<string, Session>()) {
  const identityProvider = fakeIdentityProvider(answer);
  const clock = manualClock(NOW);
  const logger = recordingLogger();
  const auth = createAuth({
    idpUrl: IDP,
    redirectUri: REDIRECT_URI,
    fetch: identityProvider.fetch,
    now: clock.now,
    logger,
    sessions
  });
  return { auth, identityProvider, clock, logger, sessions };
}

// Starts a sign-in and returns the state the provider would echo back.
function startSignIn(auth: ReturnType<typeof setup>['auth'], cookies: FakeCookieJar): string {
  return new URL(auth.startSignIn(cookies)).searchParams.get('state') ?? '';
}

// One stored session, `session-1`, whose access token expires `msLeft` after NOW.
function sessionExpiringIn(msLeft: number): Map<string, Session> {
  return new Map([
    ['session-1', { accessToken: OLD_ACCESS, refreshToken: 'refresh-1', expiresAt: NOW.getTime() + msLeft }]
  ]);
}

const signedIn = () => fakeCookieJar({ bff_session: 'session-1' });

describe('auth sign-in', () => {
  it('sends the browser to the provider with a state and an S256 challenge, behind a random id cookie', () => {
    // Arrange
    const { auth } = setup(issued);
    const cookies = fakeCookieJar();

    // Act
    const location = new URL(auth.startSignIn(cookies));

    // Assert
    expect(location.origin + location.pathname).toBe(`${IDP}/authorize`);
    expect(location.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    const state = location.searchParams.get('state') ?? '';
    expect(state).not.toBe('');
    const id = cookies.get('bff_signin') ?? '';
    expect(id).toMatch(BASE64URL_ID);
    expect(id).not.toContain(state);
    expect(cookies.options.get('bff_signin')).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/callback',
      maxAge: 600
    });
  });

  it('exchanges the code with the redirect uri and the verifier of the challenge it sent', async () => {
    // Arrange
    const { auth, identityProvider } = setup(issued);
    const cookies = fakeCookieJar();
    const location = new URL(auth.startSignIn(cookies));

    // Act
    await auth.completeSignIn(
      cookies,
      { code: 'good-code', state: location.searchParams.get('state') },
      't-1'
    );

    // Assert
    const form = identityProvider.calls[0]?.form;
    expect(identityProvider.calls[0]?.path).toBe('/token');
    expect(form?.get('grant_type')).toBe('authorization_code');
    expect(form?.get('code')).toBe('good-code');
    expect(form?.get('redirect_uri')).toBe(REDIRECT_URI);
    const verifier = form?.get('code_verifier') ?? '';
    expect(verifier).toMatch(BASE64URL_ID);
    expect(pkceChallenge(verifier)).toBe(location.searchParams.get('code_challenge'));
  });

  it('stores the tokens on the server and sets only a random session id cookie, HttpOnly + Secure + SameSite', async () => {
    // Arrange
    const { auth, logger, sessions } = setup(issued);
    const cookies = fakeCookieJar();
    const state = startSignIn(auth, cookies);

    // Act
    const outcome = await auth.completeSignIn(cookies, { code: 'good-code', state }, 'trace-1');

    // Assert
    expect(outcome).toBe('signed-in');
    const id = cookies.get('bff_session') ?? '';
    expect(id).toMatch(BASE64URL_ID);
    expect(sessions.get(id)).toEqual({
      accessToken: ACCESS,
      refreshToken: 'refresh-1',
      expiresAt: NOW.getTime() + 300_000
    });
    expect(cookies.options.get('bff_session')).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/'
    });
    const cookieValues = [...cookies.values.values()].join(' ');
    expect(cookieValues).not.toContain(ACCESS);
    expect(cookieValues).not.toContain('refresh-1');
    expect(cookies.get('bff_signin')).toBeUndefined();
    expect(logger.find('signin.ok')?.fields).toEqual({ userId: 'user-1', traceId: 'trace-1' });
  });

  it('stores nothing, sets no session cookie and logs invalid_code when the provider rejects the code', async () => {
    // Arrange
    const { auth, logger, sessions } = setup(rejects);
    const cookies = fakeCookieJar();
    const state = startSignIn(auth, cookies);

    // Act
    const outcome = await auth.completeSignIn(cookies, { code: 'bad-code', state }, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(sessions.size).toBe(0);
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
    const { auth, identityProvider, logger } = setup(issued);
    const cookies = fakeCookieJar();
    const state = startSignIn(auth, cookies);
    const callback = override === null ? { code: null, state } : { code: 'good-code', state: override };

    // Act
    const outcome = await auth.completeSignIn(cookies, callback, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(identityProvider.calls).toEqual([]);
    expect(logger.find('signin.failed')?.fields.reason).toBe(reason);
  });

  it.each([
    ['the sign-in cookie is gone', undefined],
    ['the sign-in id is unknown', 'garbage']
  ])('logs expired when %s', async (_, signInId) => {
    // Arrange
    const { auth, identityProvider, logger } = setup(issued);
    const cookies = fakeCookieJar(signInId === undefined ? {} : { bff_signin: signInId });

    // Act
    const outcome = await auth.completeSignIn(cookies, { code: 'good-code', state: 's' }, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(identityProvider.calls).toEqual([]);
    expect(logger.find('signin.failed')?.fields.reason).toBe('expired');
  });

  it('logs expired when the callback comes after the sign-in cookie lifetime (600 s)', async () => {
    // Arrange
    const { auth, clock, logger } = setup(issued);
    const cookies = fakeCookieJar();
    const state = startSignIn(auth, cookies);
    clock.advance(600_001);

    // Act
    const outcome = await auth.completeSignIn(cookies, { code: 'good-code', state }, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(logger.find('signin.failed')?.fields.reason).toBe('expired');
  });

  it('accepts one callback per sign-in attempt', async () => {
    // Arrange
    const { auth, logger } = setup(issued);
    const cookies = fakeCookieJar();
    const state = startSignIn(auth, cookies);
    const replay = fakeCookieJar({ bff_signin: cookies.get('bff_signin') ?? '' });
    await auth.completeSignIn(cookies, { code: 'good-code', state }, 't-1');

    // Act
    const outcome = await auth.completeSignIn(replay, { code: 'good-code', state }, 't-2');

    // Assert
    expect(outcome).toBe('failed');
    expect(logger.find('signin.failed')?.fields).toEqual({ reason: 'expired', traceId: 't-2' });
  });

  it('logs idp.unavailable and idp_down when the provider is down', async () => {
    // Arrange
    const { auth, logger } = setup(down);
    const cookies = fakeCookieJar();
    const state = startSignIn(auth, cookies);

    // Act
    const outcome = await auth.completeSignIn(cookies, { code: 'good-code', state }, 'trace-1');

    // Assert
    expect(outcome).toBe('failed');
    expect(logger.find('idp.unavailable')).toEqual({
      level: 'error',
      event: 'idp.unavailable',
      fields: { during: 'signin', traceId: 'trace-1' }
    });
    expect(logger.find('signin.failed')?.fields.reason).toBe('idp_down');
  });
});

describe('auth session', () => {
  it('uses the stored token without renewing while it has not expired', async () => {
    // Arrange
    const { auth, identityProvider } = setup(rotates, sessionExpiringIn(1));

    // Act
    const lookup = await auth.currentSession(signedIn(), 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'active', accessToken: OLD_ACCESS, userId: 'user-1' });
    expect(identityProvider.calls).toEqual([]);
  });

  it('renews once it has expired: the stored tokens rotate, the cookie keeps the same id', async () => {
    // Arrange
    const { auth, identityProvider, logger, sessions } = setup(rotates, sessionExpiringIn(0));
    const cookies = signedIn();

    // Act
    const lookup = await auth.currentSession(cookies, 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'active', accessToken: NEW_ACCESS, userId: 'user-1' });
    expect(identityProvider.calls[0]?.form.get('grant_type')).toBe('refresh_token');
    expect(identityProvider.calls[0]?.form.get('refresh_token')).toBe('refresh-1');
    expect(sessions.get('session-1')).toEqual({
      accessToken: NEW_ACCESS,
      refreshToken: 'refresh-2',
      expiresAt: NOW.getTime() + 300_000
    });
    expect(cookies.get('bff_session')).toBe('session-1');
    expect(cookies.options.size).toBe(0);
    expect(logger.find('refresh.ok')).toEqual({
      level: 'info',
      event: 'refresh.ok',
      fields: { userId: 'user-1', traceId: 'trace-1' }
    });
  });

  it('deletes the session, clears the cookie and reports no session when the renewal is rejected', async () => {
    // Arrange
    const { auth, logger, sessions } = setup(rejects, sessionExpiringIn(0));
    const cookies = signedIn();

    // Act
    const lookup = await auth.currentSession(cookies, 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'none' });
    expect(sessions.has('session-1')).toBe(false);
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(logger.find('refresh.failed')).toEqual({
      level: 'warn',
      event: 'refresh.failed',
      fields: { reason: 'revoked', userId: 'user-1', traceId: 'trace-1' }
    });
  });

  it('renews only once for two requests that arrive together', async () => {
    // Arrange
    const { auth, identityProvider } = setup(rotates, sessionExpiringIn(0));

    // Act
    const lookups = await Promise.all([
      auth.currentSession(signedIn(), 't-1'),
      auth.currentSession(signedIn(), 't-2')
    ]);

    // Assert
    expect(identityProvider.calls).toHaveLength(1);
    expect(lookups.map((l) => (l.kind === 'active' ? l.accessToken : l.kind))).toEqual([
      NEW_ACCESS,
      NEW_ACCESS
    ]);
  });

  it('gives the renewed session to a later request with the same cookie, without renewing again', async () => {
    // Arrange
    const { auth, identityProvider, clock } = setup(rotatesOnce(), sessionExpiringIn(0));
    await auth.currentSession(signedIn(), 't-1');
    clock.advance(60_000);

    // Act
    const lookup = await auth.currentSession(signedIn(), 't-2');

    // Assert
    expect(lookup).toEqual({ kind: 'active', accessToken: NEW_ACCESS, userId: 'user-1' });
    expect(identityProvider.calls).toHaveLength(1);
  });

  it('keeps the session and reports unavailable when the provider is down', async () => {
    // Arrange
    const { auth, logger, sessions } = setup(down, sessionExpiringIn(0));
    const cookies = signedIn();

    // Act
    const lookup = await auth.currentSession(cookies, 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'unavailable' });
    expect(sessions.get('session-1')?.refreshToken).toBe('refresh-1');
    expect(cookies.get('bff_session')).toBe('session-1');
    expect(logger.find('idp.unavailable')?.level).toBe('error');
    expect(logger.find('refresh.failed')?.fields.reason).toBe('idp_down');
  });

  it.each([
    ['no cookie', fakeCookieJar()],
    ['an unknown session id', fakeCookieJar({ bff_session: 'garbage' })]
  ])('reports no session for %s', async (_, cookies) => {
    // Arrange
    const { auth, identityProvider } = setup(rotates, sessionExpiringIn(0));

    // Act
    const lookup = await auth.currentSession(cookies, 'trace-1');

    // Assert
    expect(lookup).toEqual({ kind: 'none' });
    expect(identityProvider.calls).toEqual([]);
  });

  it.each([
    ['400', 400, { error: 'invalid_grant' }, 'none'],
    ['499', 499, { error: 'invalid_grant' }, 'none'],
    ['500', 500, {}, 'unavailable'],
    ['503', 503, {}, 'unavailable'],
    ['200 without access_token', 200, { refresh_token: 'refresh-2', expires_in: 300 }, 'unavailable'],
    ['200 without refresh_token', 200, { access_token: NEW_ACCESS, expires_in: 300 }, 'unavailable'],
    [
      '200 with a text expires_in',
      200,
      { access_token: NEW_ACCESS, refresh_token: 'r', expires_in: '300' },
      'unavailable'
    ]
  ])('treats a token answer %s as %s', async (_, status, body, kind) => {
    // Arrange
    const { auth } = setup(() => Promise.resolve(Response.json(body, { status })), sessionExpiringIn(0));

    // Act
    const lookup = await auth.currentSession(signedIn(), 'trace-1');

    // Assert
    expect(lookup.kind).toBe(kind);
  });
});

describe('auth sign-out', () => {
  it('revokes the refresh token, deletes the session and clears the cookie, so a copied cookie stops working', async () => {
    // Arrange
    const { auth, identityProvider, logger, sessions } = setup(
      () => Promise.resolve(new Response(null)),
      sessionExpiringIn(60_000)
    );
    const cookies = signedIn();

    // Act
    await auth.signOut(cookies, 'trace-1');

    // Assert
    expect(identityProvider.calls[0]?.path).toBe('/revoke');
    expect(identityProvider.calls[0]?.form.get('token')).toBe('refresh-1');
    expect(sessions.has('session-1')).toBe(false);
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(await auth.currentSession(signedIn(), 'trace-2')).toEqual({ kind: 'none' });
    expect(logger.find('signout')?.fields).toEqual({ userId: 'user-1', revoked: true, traceId: 'trace-1' });
    expect(logger.serialized()).not.toContain('refresh-1');
  });

  it.each([
    ['cannot be reached', down],
    ['answers 503', () => Promise.resolve(new Response(null, { status: 503 }))]
  ])('still signs out and logs revoked false when the provider %s', async (_, answer) => {
    // Arrange
    const { auth, logger, sessions } = setup(answer, sessionExpiringIn(60_000));
    const cookies = signedIn();

    // Act
    await auth.signOut(cookies, 'trace-1');

    // Assert
    expect(sessions.has('session-1')).toBe(false);
    expect(cookies.get('bff_session')).toBeUndefined();
    expect(logger.find('signout')?.fields.revoked).toBe(false);
    expect(logger.find('idp.unavailable')?.fields).toEqual({ during: 'signout', traceId: 'trace-1' });
  });

  it('does not call the provider when there is no session', async () => {
    // Arrange
    const { auth, identityProvider, logger } = setup(rotates);

    // Act
    await auth.signOut(fakeCookieJar({ bff_session: 'garbage' }), 'trace-1');

    // Assert
    expect(identityProvider.calls).toEqual([]);
    expect(logger.find('signout')?.fields).toEqual({ revoked: false, traceId: 'trace-1' });
  });
});

describe('auth CSRF check', () => {
  const APP = 'https://app.example';
  const incoming = (
    method: string,
    origin: string | null,
    secFetchSite: string | null = null
  ): CsrfCheck => ({
    method,
    route: '/api/v1/orders',
    origin,
    secFetchSite,
    appOrigin: APP
  });

  it.each([
    ['a GET from another site', incoming('GET', 'https://evil.example')],
    ['a POST from the app', incoming('POST', APP)],
    ['a PUT from the app', incoming('PUT', APP)],
    ['a POST without Origin but same-origin fetch metadata', incoming('POST', null, 'same-origin')]
  ])('allows %s', (_, request) => {
    // Arrange
    const { auth } = setup(rotates);

    // Act
    const refusal = auth.checkCsrf(request, 'trace-1');

    // Assert
    expect(refusal).toBeNull();
  });

  it.each([
    ['a POST from another site', incoming('POST', 'https://evil.example')],
    ['a DELETE from a sibling port', incoming('DELETE', 'https://app.example:8443')],
    ['a POST without Origin from another site', incoming('POST', null, 'cross-site')],
    ['a POST with no origin information at all', incoming('POST', null, null)]
  ])('refuses %s with a 403 csrf-rejected and logs csrf.rejected', (_, request) => {
    // Arrange
    const { auth, logger } = setup(rotates);

    // Act
    const refusal = auth.checkCsrf(request, 'trace-1');

    // Assert
    expect(refusal).toEqual({ status: 403, body: { error: { code: 'csrf-rejected' } } });
    expect(logger.find('csrf.rejected')).toEqual({
      level: 'warn',
      event: 'csrf.rejected',
      fields: { method: request.method, route: '/api/v1/orders', traceId: 'trace-1' }
    });
  });
});

describe('pkceChallenge', () => {
  it('computes the S256 challenge of the RFC 7636 appendix B example', () => {
    // Act
    const challenge = pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');

    // Assert
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('userIdOf', () => {
  it('reads the subject of a JWT', () => {
    // Act / Assert
    expect(userIdOf(accessTokenFor('3f2504e0-4f89-11d3-9a0c-0305e82c3301'))).toBe(
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    );
  });

  it.each([['opaque'], ['a.%%%.c'], [`a.${Buffer.from('{"sub":7}').toString('base64url')}.c`]])(
    'gives null for %s',
    (token) => {
      // Act / Assert
      expect(userIdOf(token)).toBeNull();
    }
  );
});
