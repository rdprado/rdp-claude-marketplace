// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the Monitoring port. RDP hasn't chosen the monitoring tool yet: until
// the project picks one (e.g. Sentry), unexpected errors go to the browser console with the last requests.
// Swap this class for the tool's SDK wrapper; nothing else changes.
import type { Monitoring, RequestRecord } from '../../application/ports/Monitoring.ts';

const KEPT_REQUESTS = 20;

export class ConsoleMonitoring implements Monitoring {
  private recent: readonly RequestRecord[] = [];

  report(error: unknown): void {
    console.error('Unexpected error', error, { recentRequests: this.recent });
  }

  recordRequest(request: RequestRecord): void {
    this.recent = [...this.recent, request].slice(-KEPT_REQUESTS);
  }
}
