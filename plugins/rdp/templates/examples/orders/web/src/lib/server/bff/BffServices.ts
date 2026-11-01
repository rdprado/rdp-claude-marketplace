// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — what the BFF entry hands to its routes (through `event.locals`): interfaces only.
import type { ApiProxyUseCase } from './ApiProxy.ts';
import type { CsrfGuardUseCase } from './CsrfGuard.ts';
import type { SignInUseCase } from './SignIn.ts';
import type { SignOutUseCase } from './SignOut.ts';
import type { Clock } from './ports/Clock.ts';
import type { Logger } from './ports/Logger.ts';
import type { Monitoring } from './ports/Monitoring.ts';

export type BffServices = {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly monitoring: Monitoring;
  readonly csrfGuard: CsrfGuardUseCase;
  readonly signIn: SignInUseCase;
  readonly signOut: SignOutUseCase;
  readonly apiProxy: ApiProxyUseCase;
};
