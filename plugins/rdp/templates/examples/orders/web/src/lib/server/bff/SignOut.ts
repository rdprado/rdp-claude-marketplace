// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — BFF use case: sign-out. Clears the session cookie and revokes the refresh token
// at the identity provider, so a copied cookie stops working too.
import { AccessToken } from './AccessToken.ts';
import type { SessionCookie } from './SessionCookie.ts';
import type { CookieJar } from './ports/CookieJar.ts';
import {
  IdentityProviderUnavailableError,
  type IdentityProviderClient
} from './ports/IdentityProviderClient.ts';
import type { Logger } from './ports/Logger.ts';

export interface SignOutUseCase {
  run(cookies: CookieJar, traceId: string): Promise<void>;
}

export class SignOut implements SignOutUseCase {
  constructor(
    private readonly identityProvider: IdentityProviderClient,
    private readonly sessionCookie: SessionCookie,
    private readonly logger: Logger
  ) {}

  async run(cookies: CookieJar, traceId: string): Promise<void> {
    const stored = this.sessionCookie.read(cookies);
    this.sessionCookie.clear(cookies);
    if (!stored) {
      this.logger.info('signout', { revoked: false, traceId });
      return;
    }

    const revoked = await this.revoke(stored.refreshToken, traceId);
    this.logger.info('signout', { userId: AccessToken.subject(stored.accessToken), revoked, traceId });
  }

  // The user is signed out of this browser either way; a failed revoke only leaves the token to expire.
  private async revoke(refreshToken: string, traceId: string): Promise<boolean> {
    try {
      await this.identityProvider.revoke(refreshToken);
      return true;
    } catch (error) {
      if (!(error instanceof IdentityProviderUnavailableError)) throw error;
      this.logger.error('idp.unavailable', { during: 'signout', traceId });
      return false;
    }
  }
}
