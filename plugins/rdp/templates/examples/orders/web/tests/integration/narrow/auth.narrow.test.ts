// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Narrow integration test of the BFF's auth module: createAuth with Node's fetch against a fake identity
// provider (kr-identity's paths) on localhost. Checks the token, refresh and revocation requests as they
// go over HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuth } from '#bff/auth.ts';
import { accessTokenFor, fakeCookieJar, manualClock, recordingLogger } from '../../support/fakes.ts';
import { startFakeHttpServer, type FakeHttpServer } from '../../support/fakeHttpServer.ts';

const REDIRECT_URI = 'https://app.example/auth/callback';
const IP_HEADER = 'x-end-user-ip';
const LOGIN_IP = '203.0.113.7';
const CLIENT_ID = 'orders-web';
// Not a real secret: only this fake provider sees it.
const CLIENT_SECRET = 'test-only-secret';
const NOW = new Date('2026-10-28T12:00:00Z');

let idp: FakeHttpServer;

beforeAll(async () => {
  idp = await startFakeHttpServer();
});

afterAll(() => idp.close());

beforeEach(() => {
  idp.requests.length = 0;
  let issued = 0;
  idp.answerWith((request) => {
    if (request.path === '/oauth/revoke') return { status: 200 };
    issued += 1;
    return {
      status: 200,
      body: {
        access_token: accessTokenFor('user-1', `a${issued}`),
        refresh_token: `refresh-${issued}`,
        expires_in: 300
      }
    };
  });
});

function setup() {
  const clock = manualClock(NOW);
  const auth = createAuth({
    identityProvider: {
      authority: idp.url,
      clientId: CLIENT_ID,
      scope: 'openid offline_access',
      clientSecret: CLIENT_SECRET
    },
    redirectUri: REDIRECT_URI,
    clientIpHeader: IP_HEADER,
    fetch,
    now: clock.now,
    logger: recordingLogger()
  });
  return { auth, clock };
}

async function signIn(auth: ReturnType<typeof setup>['auth']) {
  const cookies = fakeCookieJar();
  const state = new URL(auth.startSignIn(cookies)).searchParams.get('state');
  await auth.completeSignIn(cookies, { code: 'good-code', state }, LOGIN_IP, 'trace-1');
  return cookies;
}

const form = (index: number) => new URLSearchParams(idp.requests[index]?.body ?? '');

describe('auth against a fake identity provider', () => {
  it('exchanges the code at /oauth/token with the client credentials, the PKCE verifier and the user IP', async () => {
    // Arrange
    const { auth } = setup();

    // Act
    const cookies = await signIn(auth);

    // Assert
    expect(idp.requests[0]).toMatchObject({ method: 'POST', path: '/oauth/token' });
    expect(idp.requests[0]?.headers[IP_HEADER]).toBe(LOGIN_IP);
    expect(form(0).get('grant_type')).toBe('authorization_code');
    expect(form(0).get('client_id')).toBe(CLIENT_ID);
    expect(form(0).get('client_secret')).toBe(CLIENT_SECRET);
    expect(form(0).get('code')).toBe('good-code');
    expect(form(0).get('redirect_uri')).toBe(REDIRECT_URI);
    expect(form(0).get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookies.get('bff_session')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('refreshes an expired access token with the refresh token and the user IP', async () => {
    // Arrange
    const { auth, clock } = setup();
    const cookies = await signIn(auth);
    clock.advance(300_000);

    // Act
    const lookup = await auth.currentSession(cookies, LOGIN_IP, 'trace-2');

    // Assert
    expect(lookup).toEqual({ kind: 'active', accessToken: accessTokenFor('user-1', 'a2'), userId: 'user-1' });
    expect(idp.requests[1]?.headers[IP_HEADER]).toBe(LOGIN_IP);
    expect(form(1).get('grant_type')).toBe('refresh_token');
    expect(form(1).get('refresh_token')).toBe('refresh-1');
  });

  it('revokes the refresh token at /oauth/revoke on sign-out', async () => {
    // Arrange
    const { auth } = setup();
    const cookies = await signIn(auth);

    // Act
    await auth.signOut(cookies, 'trace-3');

    // Assert
    expect(idp.requests[1]).toMatchObject({ method: 'POST', path: '/oauth/revoke' });
    expect(form(1).get('client_id')).toBe(CLIENT_ID);
    expect(form(1).get('token')).toBe('refresh-1');
    expect(form(1).get('token_type_hint')).toBe('refresh_token');
  });
});
