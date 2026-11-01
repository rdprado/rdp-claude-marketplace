// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the Logger port over pino: one JSON line per event on stdout.
// The host collects stdout and ships it to the project's log tool; the app never writes log files.
import { pino, type DestinationStream, type Logger as Pino } from 'pino';
import type { LogFields, Logger } from '../ports/Logger.ts';

// Safety net only: the classes never pass these. `*.x` catches them one level down too.
const REDACTED = ['token', 'cookie', 'authorization', 'code'].flatMap((key) => [key, `*.${key}`]);

export class PinoLogger implements Logger {
  private readonly pino: Pino;

  // `destination` defaults to process.stdout; a test can pass its own stream.
  constructor(level = 'info', destination: DestinationStream = process.stdout) {
    this.pino = pino(
      {
        level,
        base: null,
        messageKey: 'event',
        formatters: { level: (label) => ({ level: label }) },
        redact: { paths: REDACTED, censor: '[redacted]' }
      },
      destination
    );
  }

  info(event: string, fields: LogFields = {}): void {
    this.pino.info(fields, event);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.pino.warn(fields, event);
  }

  error(event: string, fields: LogFields = {}): void {
    this.pino.error(fields, event);
  }
}
