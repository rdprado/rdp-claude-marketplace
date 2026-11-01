// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — thrown when the BFF/API answers something no screen handles (5xx, an
// unknown status, a malformed body). ViewModels catch it, show `errors.unexpected` and report it.
export class UnexpectedResponseError extends Error {
  constructor(
    readonly status: number,
    reason = 'unexpected status'
  ) {
    super(`Unexpected response (${status}): ${reason}`);
    this.name = 'UnexpectedResponseError';
  }
}
