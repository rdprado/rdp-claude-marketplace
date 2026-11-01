// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — the BFF's cookies: the session (the tokens, HttpOnly, never readable by browser
// JavaScript) and the sign-in attempt (state + PKCE verifier, only sent back to /auth/callback).
// Both values are sealed (AES-256-GCM, see CookieSeal): the browser holds only ciphertext.
import type { CookieSeal } from './CookieSeal.ts';
import { isObject } from './isObject.ts';
import type { CookieJar, CookieOptions } from './ports/CookieJar.ts';
import type { TokenSet } from './ports/IdentityProviderClient.ts';

export type StoredSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  // When the access token expires, epoch milliseconds.
  readonly expiresAt: number;
};

export type SignInAttempt = {
  readonly state: string;
  readonly codeVerifier: string;
};

const SESSION = 'bff_session';
const SIGN_IN = 'bff_signin';
const SIGN_IN_PATH = '/auth/callback';
const SIGN_IN_MAX_AGE_SECONDS = 600;

// Lax, not Strict: the identity provider sends the browser back with a cross-site redirect, and the
// sign-in cookie must come with it. Mutating requests are covered by the CSRF check.
const sessionOptions: CookieOptions = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' };
const signInOptions: CookieOptions = {
  path: SIGN_IN_PATH,
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: SIGN_IN_MAX_AGE_SECONDS
};

export class SessionCookie {
  constructor(private readonly seal: CookieSeal) {}

  static fromTokens(tokens: TokenSet, now: Date): StoredSession {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: now.getTime() + tokens.expiresInSeconds * 1000
    };
  }

  // Parsed once here and trusted afterwards; a tampered or undecryptable cookie counts as no session.
  read(cookies: CookieJar): StoredSession | null {
    const opened = this.seal.open(SESSION, cookies.get(SESSION));
    return isStoredSession(opened) ? opened : null;
  }

  write(cookies: CookieJar, session: StoredSession): void {
    cookies.set(SESSION, this.seal.seal(SESSION, session), sessionOptions);
  }

  clear(cookies: CookieJar): void {
    cookies.delete(SESSION, { path: sessionOptions.path });
  }
}

export class SignInCookie {
  constructor(private readonly seal: CookieSeal) {}

  read(cookies: CookieJar): SignInAttempt | null {
    const opened = this.seal.open(SIGN_IN, cookies.get(SIGN_IN));
    return isSignInAttempt(opened) ? opened : null;
  }

  write(cookies: CookieJar, attempt: SignInAttempt): void {
    cookies.set(SIGN_IN, this.seal.seal(SIGN_IN, attempt), signInOptions);
  }

  clear(cookies: CookieJar): void {
    cookies.delete(SIGN_IN, { path: SIGN_IN_PATH });
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!isObject(value)) return false;
  const v = value;
  return (
    typeof v.accessToken === 'string' && typeof v.refreshToken === 'string' && typeof v.expiresAt === 'number'
  );
}

function isSignInAttempt(value: unknown): value is SignInAttempt {
  if (!isObject(value)) return false;
  const v = value;
  return typeof v.state === 'string' && typeof v.codeVerifier === 'string';
}
