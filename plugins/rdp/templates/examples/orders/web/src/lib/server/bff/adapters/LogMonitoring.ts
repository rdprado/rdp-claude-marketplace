// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the BFF's Monitoring port. RDP hasn't chosen the monitoring tool
// yet: until the project picks one (e.g. Sentry), unexpected errors go to the log with their stack.
// Swap this class for the tool's SDK wrapper; nothing else changes.
import type { Logger } from '../ports/Logger.ts';
import type { Monitoring } from '../ports/Monitoring.ts';

export class LogMonitoring implements Monitoring {
  constructor(private readonly logger: Logger) {}

  report(error: unknown, context: Readonly<Record<string, string>> = {}): void {
    const { name, message, stack } = error instanceof Error ? error : new Error(String(error));
    this.logger.error('unexpected', { ...context, error: { name, message, stack } });
  }
}
