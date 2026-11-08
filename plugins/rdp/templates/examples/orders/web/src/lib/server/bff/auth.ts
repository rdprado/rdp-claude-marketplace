// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// The BFF's sign-in and session: authorization code + PKCE with the identity provider, the tokens kept on
// the server, refresh with rotation, sign-out, and the CSRF check. The browser holds only a random
// session id in an HttpOnly cookie: never a token, not even encrypted.
import { createHash, randomBytes } from 'node:crypto';
import { isObject } from './isObject.ts';
import type { Logger } from './observability.ts';

// The part of `fetch` the BFF uses; the real one fits.
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type CookieOptions = {
  readonly path: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'lax' | 'strict';
  readonly maxAge?: number;
};

// The request's cookies. SvelteKit's `event.cookies` fits as is.
export type CookieJar = {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  delete(name: string, options: { readonly path: string }): void;
};

// What the server keeps per session id.
export type Session = {
  readonly accessToken: string;
  readonly refreshToken: string;
  // When the access token expires, epoch milliseconds.
  readonly expiresAt: number;
};

export type SessionLookup =
  | { readonly kind: 'active'; readonly accessToken: string; readonly userId: string | null }
  | { readonly kind: 'none' } // no session, or it can't be renewed: sign in again
  | { readonly kind: 'unavailable' }; // the identity provider is down: try again later

export type SignInCallback = {
  readonly code: string | null;
  readonly state: string | null;
};

export type SignInOutcome = 'signed-in' | 'failed';

export type CsrfCheck = {
  readonly method: string;
  readonly route: string;
  readonly origin: string | null;
  readonly secFetchSite: string | null;
  readonly appOrigin: string;
};

// The refusal the entry sends back, in the API's error shape.
export type CsrfRefusal = {
  readonly status: 403;
  readonly body: { readonly error: { readonly code: 'csrf-rejected' } };
};

export type AuthOptions = {
  readonly idpUrl: string;
  readonly redirectUri: string;
  readonly fetch: Fetch;
  readonly now: () => Date;
  readonly logger: Logger;
  // In memory by default: a restart signs everyone out, and the BFF runs as one instance. Sessions stay
  // until sign-out or a failed refresh.
  readonly sessions?: Map<string, Session>;
};

export type Auth = ReturnType<typeof createAuth>;

type SignInAttempt = { readonly state: string; readonly codeVerifier: string; readonly startedAt: number };
type FailureReason = 'expired' | 'invalid_state' | 'invalid_code' | 'idp_down';
type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
};
// `rejected` is the provider's `invalid_grant` (bad, expired, revoked or reused code/token).
type TokenResult =
  | { readonly kind: 'issued'; readonly tokens: TokenSet }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'unavailable' };
type Renewal =
  | { readonly kind: 'renewed'; readonly session: Session }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'unavailable' };

const SESSION_COOKIE = 'bff_session';
const SIGN_IN_COOKIE = 'bff_signin';
const CALLBACK_PATH = '/auth/callback';
const SIGN_IN_MAX_AGE_SECONDS = 600;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Lax, not Strict: the identity provider sends the browser back with a cross-site redirect, and the
// sign-in cookie must come with it. Mutating requests are covered by the CSRF check.
const sessionCookie: CookieOptions = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' };
const signInCookie: CookieOptions = {
  ...sessionCookie,
  path: CALLBACK_PATH,
  maxAge: SIGN_IN_MAX_AGE_SECONDS
};

export function createAuth(options: AuthOptions) {
  const { redirectUri, now, logger } = options;
  const idp = identityProvider(options.idpUrl, options.fetch);
  const sessions = options.sessions ?? new Map<string, Session>();
  // Keyed by the random id in the sign-in cookie: state + PKCE verifier never leave the server.
  const signIns = new Map<string, SignInAttempt>();
  // Keyed by session id: requests that arrive together share one renewal, because a second call would
  // present an already-rotated refresh token and the provider would revoke the whole sign-in.
  const renewals = new Map<string, Promise<Renewal>>();

  // Starts a sign-in and returns where to send the browser.
  function startSignIn(cookies: CookieJar): string {
    forgetExpiredSignIns();
    const attempt = {
      state: randomBytes(16).toString('base64url'),
      codeVerifier: randomBytes(32).toString('base64url'),
      startedAt: now().getTime()
    };
    const id = newId();
    signIns.set(id, attempt);
    cookies.set(SIGN_IN_COOKIE, id, signInCookie);
    return idp.authorizeUrl(redirectUri, attempt.state, pkceChallenge(attempt.codeVerifier));
  }

  // Finishes it on /auth/callback: checks the state, exchanges the code, stores the tokens.
  async function completeSignIn(
    cookies: CookieJar,
    callback: SignInCallback,
    traceId: string
  ): Promise<SignInOutcome> {
    const id = cookies.get(SIGN_IN_COOKIE);
    const attempt = id === undefined ? undefined : signIns.get(id);
    if (id !== undefined) signIns.delete(id); // one attempt, one callback
    cookies.delete(SIGN_IN_COOKIE, { path: CALLBACK_PATH });
    if (!attempt || isExpired(attempt)) return failSignIn('expired', traceId);
    if (callback.state !== attempt.state) return failSignIn('invalid_state', traceId);
    if (!callback.code) return failSignIn('invalid_code', traceId);

    const result = await idp.exchangeCode(callback.code, redirectUri, attempt.codeVerifier);
    if (result.kind === 'unavailable') {
      logger.error('idp.unavailable', { during: 'signin', traceId });
      return failSignIn('idp_down', traceId);
    }
    if (result.kind === 'rejected') return failSignIn('invalid_code', traceId);

    const sessionId = newId();
    sessions.set(sessionId, sessionFrom(result.tokens));
    cookies.set(SESSION_COOKIE, sessionId, sessionCookie);
    logger.info('signin.ok', { userId: userIdOf(result.tokens.accessToken), traceId });
    return 'signed-in';
  }

  // The access token for this request, renewed with the rotating refresh token once it has expired.
  async function currentSession(cookies: CookieJar, traceId: string): Promise<SessionLookup> {
    const id = cookies.get(SESSION_COOKIE);
    const stored = id === undefined ? undefined : sessions.get(id);
    if (id === undefined || !stored) return { kind: 'none' }; // an unknown id counts as no session
    if (stored.expiresAt > now().getTime()) return active(stored);

    const renewal = await renew(id, stored, traceId);
    switch (renewal.kind) {
      case 'renewed':
        return active(renewal.session); // same id: the cookie doesn't change
      case 'rejected':
        cookies.delete(SESSION_COOKIE, { path: sessionCookie.path });
        return { kind: 'none' };
      case 'unavailable':
        return { kind: 'unavailable' }; // keep the session: it may still be good
    }
  }

  function renew(id: string, stored: Session, traceId: string): Promise<Renewal> {
    const pending = renewals.get(id);
    if (pending) return pending;
    const renewal = refresh(id, stored, traceId).finally(() => renewals.delete(id));
    renewals.set(id, renewal);
    return renewal;
  }

  async function refresh(id: string, stored: Session, traceId: string): Promise<Renewal> {
    const userId = userIdOf(stored.accessToken);
    const result = await idp.refresh(stored.refreshToken);
    if (result.kind === 'unavailable') {
      logger.error('idp.unavailable', { during: 'refresh', traceId });
      logger.warn('refresh.failed', { reason: 'idp_down', userId, traceId });
      return { kind: 'unavailable' };
    }
    if (result.kind === 'rejected') {
      // Expired, revoked, or a rotated token used again (the provider spots reuse): sign in again.
      sessions.delete(id);
      logger.warn('refresh.failed', { reason: 'revoked', userId, traceId });
      return { kind: 'rejected' };
    }

    const session = sessionFrom(result.tokens);
    if (sessions.has(id)) sessions.set(id, session); // unless it signed out meanwhile
    logger.info('refresh.ok', { userId, traceId });
    return { kind: 'renewed', session };
  }

  // Deletes the session and revokes the refresh token at the identity provider, so a copied cookie stops
  // working too. The user is signed out of this browser either way; a failed revoke only leaves the token
  // to expire.
  async function signOut(cookies: CookieJar, traceId: string): Promise<void> {
    const id = cookies.get(SESSION_COOKIE);
    const stored = id === undefined ? undefined : sessions.get(id);
    cookies.delete(SESSION_COOKIE, { path: sessionCookie.path });
    if (id === undefined || !stored) {
      logger.info('signout', { revoked: false, traceId });
      return;
    }

    sessions.delete(id);
    const revoked = await idp.revoke(stored.refreshToken);
    if (!revoked) logger.error('idp.unavailable', { during: 'signout', traceId });
    logger.info('signout', { userId: userIdOf(stored.accessToken), revoked, traceId });
  }

  // Refuses mutating requests that don't come from the app's own origin: the session cookie goes with
  // every request the browser makes, so this is what stops another site from posting with it.
  // null: let the request through; otherwise the refusal to send instead.
  function checkCsrf(request: CsrfCheck, traceId: string): CsrfRefusal | null {
    if (SAFE_METHODS.has(request.method.toUpperCase())) return null;
    if (isSameOrigin(request)) return null;
    logger.warn('csrf.rejected', { method: request.method, route: request.route, traceId });
    return { status: 403, body: { error: { code: 'csrf-rejected' } } };
  }

  function failSignIn(reason: FailureReason, traceId: string): SignInOutcome {
    logger.warn('signin.failed', { reason, traceId });
    return 'failed';
  }

  function sessionFrom(tokens: TokenSet): Session {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: now().getTime() + tokens.expiresInSeconds * 1000
    };
  }

  function isExpired(attempt: SignInAttempt): boolean {
    return now().getTime() - attempt.startedAt > SIGN_IN_MAX_AGE_SECONDS * 1000;
  }

  function forgetExpiredSignIns(): void {
    for (const [id, attempt] of signIns) if (isExpired(attempt)) signIns.delete(id);
  }

  return { startSignIn, completeSignIn, currentSession, signOut, checkCsrf };
}

// S256 (RFC 7636): BASE64URL(SHA256(verifier)).
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

// The user id (`sub`) of an access token, for log lines only. Not verified here: the API verifies the
// token on every call.
export function userIdOf(accessToken: string): string | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return isObject(claims) && typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null; // not a JWT: logs go without a user id
  }
}

// From the platform's cryptographic generator, never Math.random: whoever guesses an id holds the session.
function newId(): string {
  return randomBytes(32).toString('base64url');
}

function active(session: Session): SessionLookup {
  return { kind: 'active', accessToken: session.accessToken, userId: userIdOf(session.accessToken) };
}

// Browsers send Origin on every cross-origin or non-GET fetch; Sec-Fetch-Site covers the rare request
// without it. Neither header can be set by page JavaScript.
function isSameOrigin(request: CsrfCheck): boolean {
  if (request.origin !== null) return request.origin === request.appOrigin;
  return request.secFetchSite === 'same-origin';
}

// The identity provider's OAuth endpoints: `{IdentityProvider:Url}/authorize`, `/token`, `/revoke`.
function identityProvider(baseUrl: string, fetch: Fetch) {
  // null: the provider can't be reached.
  async function post(path: string, form: Record<string, string>): Promise<Response | null> {
    try {
      return await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(form)
      });
    } catch {
      return null;
    }
  }

  async function requestTokens(form: Record<string, string>): Promise<TokenResult> {
    const response = await post('/token', form);
    if (response === null) return { kind: 'unavailable' };
    if (response.status >= 400 && response.status < 500) return { kind: 'rejected' };
    if (!response.ok) return { kind: 'unavailable' };
    const tokens = parseTokens(await response.json());
    return tokens ? { kind: 'issued', tokens } : { kind: 'unavailable' };
  }

  return {
    authorizeUrl(redirectUri: string, state: string, codeChallenge: string): string {
      const query = new URLSearchParams({
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });
      return `${baseUrl}/authorize?${query}`;
    },
    exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<TokenResult> {
      return requestTokens({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      });
    },
    refresh(refreshToken: string): Promise<TokenResult> {
      return requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
    },
    // RFC 7009: the provider answers 200 even for an unknown token, so anything else is a failure.
    async revoke(refreshToken: string): Promise<boolean> {
      const response = await post('/revoke', { token: refreshToken });
      return response?.ok === true;
    }
  };
}

// A token answer without the expected fields counts as the provider failing.
function parseTokens(json: unknown): TokenSet | null {
  if (!isObject(json)) return null;
  const { access_token, refresh_token, expires_in } = json;
  if (
    typeof access_token !== 'string' ||
    typeof refresh_token !== 'string' ||
    typeof expires_in !== 'number'
  ) {
    return null;
  }
  return { accessToken: access_token, refreshToken: refresh_token, expiresInSeconds: expires_in };
}
