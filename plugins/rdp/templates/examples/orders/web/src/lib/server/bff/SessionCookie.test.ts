// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { AccessToken } from './AccessToken.ts';
import { CookieSeal } from './CookieSeal.ts';
import { SessionCookie } from './SessionCookie.ts';
import {
  FakeCookieJar,
  accessTokenFor,
  testSeal,
  testSessionCookie,
  testSignInCookie
} from './testing/fakes.ts';

const SESSION = { accessToken: accessTokenFor('user-1'), refreshToken: 'refresh-1', expiresAt: 1_000 };

// Flips one bit of the sealed value, as a user editing the cookie in DevTools would.
function tampered(raw: string, byteIndex: number): string {
  const bytes = Buffer.from(raw, 'base64url');
  bytes[byteIndex] = (bytes[byteIndex] ?? 0) ^ 1;
  return bytes.toString('base64url');
}

describe('SessionCookie', () => {
  it('reads back what it wrote', () => {
    // Arrange
    const cookies = new FakeCookieJar();

    // Act
    testSessionCookie.write(cookies, SESSION);

    // Assert
    expect(testSessionCookie.read(cookies)).toEqual(SESSION);
  });

  it('stores ciphertext only: no token, no JWT, no JSON', () => {
    // Arrange
    const cookies = new FakeCookieJar();

    // Act
    testSessionCookie.write(cookies, SESSION);

    // Assert
    const raw = cookies.get('bff_session') ?? '';
    expect(raw).not.toContain(SESSION.accessToken);
    expect(raw).not.toContain('eyJ');
    expect(Buffer.from(raw, 'base64url').toString('utf8')).not.toContain('refresh-1');
  });

  it('seals the same session differently each time (random IV)', () => {
    // Arrange
    const first = new FakeCookieJar();
    const second = new FakeCookieJar();

    // Act
    testSessionCookie.write(first, SESSION);
    testSessionCookie.write(second, SESSION);

    // Assert
    expect(first.get('bff_session')).not.toBe(second.get('bff_session'));
  });

  it.each([
    ['the IV', 0],
    ['the auth tag', 12],
    ['the ciphertext', 40]
  ])('treats a cookie with a changed byte in %s as no session', (_, byteIndex) => {
    // Arrange
    const cookies = new FakeCookieJar();
    testSessionCookie.write(cookies, SESSION);
    cookies.values.set('bff_session', tampered(cookies.get('bff_session') ?? '', byteIndex));

    // Act
    const session = testSessionCookie.read(cookies);

    // Assert
    expect(session).toBeNull();
  });

  it.each([
    ['not base64', '%%%'],
    ['too short to hold an IV and tag', Buffer.from('short').toString('base64url')],
    [
      'the old plain base64 JSON',
      Buffer.from(JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: 1 })).toString('base64url')
    ]
  ])('treats a cookie that is %s as no session', (_, raw) => {
    // Arrange
    const cookies = new FakeCookieJar();
    cookies.values.set('bff_session', raw);

    // Act
    const session = testSessionCookie.read(cookies);

    // Assert
    expect(session).toBeNull();
  });

  it('treats a cookie sealed with another Session:Secret as no session', () => {
    // Arrange
    const cookies = new FakeCookieJar();
    new SessionCookie(new CookieSeal('another-secret-of-at-least-32-characters')).write(cookies, SESSION);

    // Act
    const session = testSessionCookie.read(cookies);

    // Assert
    expect(session).toBeNull();
  });

  it.each([
    ['a list', []],
    ['no access token', { ...SESSION, accessToken: undefined }],
    ['no refresh token', { ...SESSION, refreshToken: undefined }],
    ['no expiry', { ...SESSION, expiresAt: undefined }]
  ])('treats a sealed session cookie with %s as no session', (_, value) => {
    // Arrange: sealed with the right key, so only the shape is wrong
    const cookies = new FakeCookieJar();
    cookies.values.set('bff_session', testSeal.seal('bff_session', value));

    // Act
    const session = testSessionCookie.read(cookies);

    // Assert
    expect(session).toBeNull();
  });

  it('treats a sign-in cookie value copied into the session cookie as no session', () => {
    // Arrange
    const cookies = new FakeCookieJar();
    testSignInCookie.write(cookies, { state: 's', codeVerifier: 'v' });
    cookies.values.set('bff_session', cookies.get('bff_signin') ?? '');

    // Act
    const session = testSessionCookie.read(cookies);

    // Assert
    expect(session).toBeNull();
  });
});

describe('SignInCookie', () => {
  it('reads back the attempt and stores no readable PKCE verifier', () => {
    // Arrange
    const cookies = new FakeCookieJar();
    const attempt = { state: 'state-1', codeVerifier: 'verifier-1' };

    // Act
    testSignInCookie.write(cookies, attempt);

    // Assert
    expect(testSignInCookie.read(cookies)).toEqual(attempt);
    expect(Buffer.from(cookies.get('bff_signin') ?? '', 'base64url').toString('utf8')).not.toContain(
      'verifier-1'
    );
  });

  it.each([
    ['a list', []],
    ['no state', { codeVerifier: 'verifier-1' }],
    ['no verifier', { state: 'state-1' }]
  ])('treats a sealed sign-in cookie with %s as no attempt', (_, value) => {
    // Arrange
    const cookies = new FakeCookieJar();
    cookies.values.set('bff_signin', testSeal.seal('bff_signin', value));

    // Act
    const attempt = testSignInCookie.read(cookies);

    // Assert
    expect(attempt).toBeNull();
  });

  it('treats a tampered sign-in cookie as no attempt', () => {
    // Arrange
    const cookies = new FakeCookieJar();
    testSignInCookie.write(cookies, { state: 'state-1', codeVerifier: 'verifier-1' });
    cookies.values.set('bff_signin', tampered(cookies.get('bff_signin') ?? '', 30));

    // Act
    const attempt = testSignInCookie.read(cookies);

    // Assert
    expect(attempt).toBeNull();
  });
});

describe('AccessToken', () => {
  it('reads the subject of a JWT', () => {
    // Act / Assert
    expect(AccessToken.subject(accessTokenFor('3f2504e0-4f89-11d3-9a0c-0305e82c3301'))).toBe(
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    );
  });

  it.each([['opaque'], ['a.%%%.c'], [`a.${Buffer.from('{"sub":7}').toString('base64url')}.c`]])(
    'gives null for %s',
    (token) => {
      // Act / Assert
      expect(AccessToken.subject(token)).toBeNull();
    }
  );
});
