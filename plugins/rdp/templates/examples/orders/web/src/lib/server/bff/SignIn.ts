// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — BFF use case: sign-in with the authorization code flow + PKCE. The browser only
// ever holds the HttpOnly session cookie; the code exchange happens here, server to server.
import { AccessToken } from './AccessToken.ts';
import { Pkce } from './Pkce.ts';
import { SessionCookie, type SignInCookie } from './SessionCookie.ts';
import type { Clock } from './ports/Clock.ts';
import type { CookieJar } from './ports/CookieJar.ts';
import {
  IdentityProviderUnavailableError,
  type IdentityProviderClient,
  type TokenResult
} from './ports/IdentityProviderClient.ts';
import type { Logger } from './ports/Logger.ts';

export type SignInCallback = {
  readonly code: string | null;
  readonly state: string | null;
};

export type SignInOutcome = 'signed-in' | 'failed';

type FailureReason = 'expired' | 'invalid_state' | 'invalid_code' | 'idp_down';

export interface SignInUseCase {
  // Starts a sign-in: remembers state + verifier in a short-lived cookie, returns where to send the browser.
  start(cookies: CookieJar): string;
  // Finishes it on /auth/callback: checks the state, exchanges the code, sets the session cookie.
  complete(cookies: CookieJar, callback: SignInCallback, traceId: string): Promise<SignInOutcome>;
}

export class SignIn implements SignInUseCase {
  constructor(
    private readonly identityProvider: IdentityProviderClient,
    private readonly sessionCookie: SessionCookie,
    private readonly signInCookie: SignInCookie,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly redirectUri: string
  ) {}

  start(cookies: CookieJar): string {
    const attempt = { state: Pkce.createState(), codeVerifier: Pkce.createVerifier() };
    this.signInCookie.write(cookies, attempt);
    return this.identityProvider.authorizeUrl({
      redirectUri: this.redirectUri,
      state: attempt.state,
      codeChallenge: Pkce.challengeOf(attempt.codeVerifier)
    });
  }

  async complete(cookies: CookieJar, callback: SignInCallback, traceId: string): Promise<SignInOutcome> {
    const attempt = this.signInCookie.read(cookies);
    this.signInCookie.clear(cookies); // one attempt, one callback
    if (!attempt) return this.fail('expired', traceId);
    if (callback.state !== attempt.state) return this.fail('invalid_state', traceId);
    if (!callback.code) return this.fail('invalid_code', traceId);

    const result = await this.exchange(callback.code, attempt.codeVerifier, traceId);
    if (result === 'unavailable') return this.fail('idp_down', traceId);
    if (result.kind === 'rejected') return this.fail('invalid_code', traceId);

    this.sessionCookie.write(cookies, SessionCookie.fromTokens(result.tokens, this.clock.now()));
    this.logger.info('signin.ok', { userId: AccessToken.subject(result.tokens.accessToken), traceId });
    return 'signed-in';
  }

  private async exchange(
    code: string,
    codeVerifier: string,
    traceId: string
  ): Promise<TokenResult | 'unavailable'> {
    try {
      return await this.identityProvider.exchangeCode({ code, codeVerifier, redirectUri: this.redirectUri });
    } catch (error) {
      if (!(error instanceof IdentityProviderUnavailableError)) throw error;
      this.logger.error('idp.unavailable', { during: 'signin', traceId });
      return 'unavailable';
    }
  }

  private fail(reason: FailureReason, traceId: string): SignInOutcome {
    this.logger.warn('signin.failed', { reason, traceId });
    return 'failed';
  }
}
