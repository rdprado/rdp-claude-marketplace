// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the Session port: an expired session sends the browser to the BFF's
// sign-in route (a full page load, so the BFF can redirect to the identity provider).
import type { Session } from '../../application/ports/Session.ts';

const SIGN_IN = '/auth/signin';

export class BrowserSession implements Session {
  constructor(private readonly navigate: (url: string) => void) {}

  expired(): void {
    this.navigate(SIGN_IN);
  }
}
