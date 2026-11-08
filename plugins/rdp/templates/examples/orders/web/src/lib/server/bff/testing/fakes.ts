// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Tests only: plain fakes of what the BFF modules take as parameters (cookies, clock, logger).
import type { CookieJar, CookieOptions } from '../auth.ts';
import type { LogFields, Logger } from '../observability.ts';

export type FakeCookieJar = CookieJar & {
  readonly values: Map<string, string>;
  readonly options: Map<string, CookieOptions>;
};

export function fakeCookieJar(values: Readonly<Record<string, string>> = {}): FakeCookieJar {
  const jar = new Map(Object.entries(values));
  const options = new Map<string, CookieOptions>();
  return {
    values: jar,
    options,
    get: (name) => jar.get(name),
    set: (name, value, cookieOptions) => {
      jar.set(name, value);
      options.set(name, cookieOptions);
    },
    delete: (name) => {
      jar.delete(name);
    }
  };
}

export type LogEntry = {
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
  readonly fields: LogFields;
};

export type RecordingLogger = Logger & {
  readonly entries: LogEntry[];
  find(event: string): LogEntry | undefined;
  serialized(): string;
};

export function recordingLogger(): RecordingLogger {
  const entries: LogEntry[] = [];
  return {
    entries,
    info: (event, fields = {}) => entries.push({ level: 'info', event, fields }),
    warn: (event, fields = {}) => entries.push({ level: 'warn', event, fields }),
    error: (event, fields = {}) => entries.push({ level: 'error', event, fields }),
    find: (event) => entries.find((entry) => entry.event === event),
    serialized: () => JSON.stringify(entries)
  };
}

export type ManualClock = { readonly now: () => Date; advance(ms: number): void };

export function manualClock(start: Date): ManualClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    }
  };
}

// An unsigned JWT-shaped token with the given `sub`: enough for the BFF, which only reads it for logs.
export function accessTokenFor(sub: string, marker = 'a'): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ sub, marker })}.signature`;
}
