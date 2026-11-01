// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — BFF use case: gives each request a valid access token, renewing it with the
// rotating refresh token when it is about to expire.
//
// Rotation makes two things matter:
// - Requests that arrive together with the same expired cookie share ONE renewal (otherwise the second
//   call would present an already-rotated token and the provider would revoke the whole sign-in).
// - Requests still carrying the old cookie shortly after a renewal get the renewed session (grace).
//   After the grace, a rotated token coming back is a reuse: possible theft, logged as an error.
//   The grace exists for concurrent requests: the page fires several calls at once, one renews, the
//   others were already sent with the old cookie. The trade-off: during the grace a stolen old cookie
//   also gets the renewed session, so it is kept short (5 s), just enough for requests in flight.
// State is per process; behind several BFF instances the requests of one browser need sticky routing.
import { AccessToken } from './AccessToken.ts';
import { SessionCookie, type StoredSession } from './SessionCookie.ts';
import type { Clock } from './ports/Clock.ts';
import type { CookieJar } from './ports/CookieJar.ts';
import {
  IdentityProviderUnavailableError,
  type IdentityProviderClient,
  type TokenResult
} from './ports/IdentityProviderClient.ts';
import type { Logger } from './ports/Logger.ts';

export type ActiveSession = {
  readonly accessToken: string;
  readonly userId: string | null;
};

export type SessionLookup =
  | { readonly kind: 'active'; readonly session: ActiveSession }
  | { readonly kind: 'none' } // no session, or it can't be renewed: sign in again
  | { readonly kind: 'unavailable' }; // the identity provider is down: try again later

export type RefreshTimings = {
  // Renew when the access token has less than this left, so it doesn't expire on the way to the API.
  readonly renewBeforeMs: number;
  // How long a just-rotated token still returns the renewed session (concurrent requests already in
  // flight). Longer helps slow clients; shorter narrows the window for a stolen old cookie.
  readonly graceMs: number;
  // How long a rotated token is remembered, to recognize its reuse.
  readonly rememberRotatedMs: number;
};

export const defaultRefreshTimings: RefreshTimings = {
  renewBeforeMs: 30_000,
  graceMs: 5_000,
  rememberRotatedMs: 24 * 60 * 60_000
};

type Renewal =
  | { readonly kind: 'renewed'; readonly session: StoredSession }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'unavailable' };

export interface SessionRefresherUseCase {
  current(cookies: CookieJar, traceId: string): Promise<SessionLookup>;
}

export class SessionRefresher implements SessionRefresherUseCase {
  private readonly inFlight = new Map<string, Promise<Renewal>>();
  private readonly rotated = new Map<string, { readonly at: number; readonly session: StoredSession }>();

  constructor(
    private readonly identityProvider: IdentityProviderClient,
    private readonly sessionCookie: SessionCookie,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly timings: RefreshTimings = defaultRefreshTimings
  ) {}

  async current(cookies: CookieJar, traceId: string): Promise<SessionLookup> {
    const stored = this.sessionCookie.read(cookies);
    if (!stored) return { kind: 'none' };
    if (stored.expiresAt - this.clock.now().getTime() > this.timings.renewBeforeMs) {
      return active(stored);
    }

    const renewal = await this.renew(stored, traceId);
    switch (renewal.kind) {
      case 'renewed':
        this.sessionCookie.write(cookies, renewal.session);
        return active(renewal.session);
      case 'rejected':
        this.sessionCookie.clear(cookies);
        return { kind: 'none' };
      case 'unavailable':
        return { kind: 'unavailable' }; // keep the cookie: the session may still be good
    }
  }

  private renew(stored: StoredSession, traceId: string): Promise<Renewal> {
    const now = this.clock.now().getTime();
    this.forgetOldRotations(now);

    const recent = this.rotated.get(stored.refreshToken);
    if (recent && now - recent.at <= this.timings.graceMs) {
      return Promise.resolve({ kind: 'renewed', session: recent.session });
    }

    const pending = this.inFlight.get(stored.refreshToken);
    if (pending) return pending;

    const renewal = this.callIdentityProvider(stored, traceId).finally(() =>
      this.inFlight.delete(stored.refreshToken)
    );
    this.inFlight.set(stored.refreshToken, renewal);
    return renewal;
  }

  private async callIdentityProvider(stored: StoredSession, traceId: string): Promise<Renewal> {
    const userId = AccessToken.subject(stored.accessToken);
    const result = await this.refreshOrUnavailable(stored.refreshToken, userId, traceId);
    if (result === 'unavailable') return { kind: 'unavailable' };

    if (result.kind === 'rejected') {
      this.logRejection(stored.refreshToken, userId, traceId);
      return { kind: 'rejected' };
    }

    const now = this.clock.now();
    const session = SessionCookie.fromTokens(result.tokens, now);
    this.rotated.set(stored.refreshToken, { at: now.getTime(), session });
    this.logger.info('refresh.ok', { userId, traceId });
    return { kind: 'renewed', session };
  }

  private async refreshOrUnavailable(
    refreshToken: string,
    userId: string | null,
    traceId: string
  ): Promise<TokenResult | 'unavailable'> {
    try {
      return await this.identityProvider.refresh(refreshToken);
    } catch (error) {
      if (!(error instanceof IdentityProviderUnavailableError)) throw error;
      this.logger.error('idp.unavailable', { during: 'refresh', traceId });
      this.logger.warn('refresh.failed', { reason: 'idp_down', userId, traceId });
      return 'unavailable';
    }
  }

  private logRejection(refreshToken: string, userId: string | null, traceId: string): void {
    if (this.rotated.has(refreshToken)) {
      // We rotated this token ourselves and the grace is over: someone replayed an old cookie.
      this.logger.error('refresh.reused', { userId, traceId });
      return;
    }
    this.logger.warn('refresh.failed', { reason: 'revoked', userId, traceId });
  }

  private forgetOldRotations(now: number): void {
    for (const [token, rotation] of this.rotated) {
      if (now - rotation.at > this.timings.rememberRotatedMs) this.rotated.delete(token);
    }
  }
}

function active(session: StoredSession): SessionLookup {
  return {
    kind: 'active',
    session: { accessToken: session.accessToken, userId: AccessToken.subject(session.accessToken) }
  };
}
