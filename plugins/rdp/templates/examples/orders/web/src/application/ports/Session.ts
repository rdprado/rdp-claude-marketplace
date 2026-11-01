// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: what happens when the BFF says the session is over (it already tried to
// renew the token), and the error the shared HTTP adapter throws right after.
export interface Session {
  // Sends the user back to sign in.
  expired(): void;
}

// Not a bug: ViewModels stop quietly and never report it to monitoring.
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}
