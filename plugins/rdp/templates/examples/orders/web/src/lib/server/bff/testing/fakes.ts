// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application (tests only) — hand-written fakes of the BFF's ports, shared by its unit tests.
import { CookieSeal } from '../CookieSeal.ts';
import { SessionCookie, SignInCookie } from '../SessionCookie.ts';
import type { Clock } from '../ports/Clock.ts';
import type { CookieJar, CookieOptions } from '../ports/CookieJar.ts';
import type { LogFields, Logger } from '../ports/Logger.ts';

export class FakeCookieJar implements CookieJar {
  readonly values = new Map<string, string>();
  readonly options = new Map<string, CookieOptions>();

  get(name: string): string | undefined {
    return this.values.get(name);
  }

  set(name: string, value: string, options: CookieOptions): void {
    this.values.set(name, value);
    this.options.set(name, options);
  }

  delete(name: string): void {
    this.values.delete(name);
  }

  // Copies the cookies, as a second browser request carrying the same cookies would.
  copy(): FakeCookieJar {
    const copy = new FakeCookieJar();
    this.values.forEach((value, name) => copy.values.set(name, value));
    return copy;
  }
}

export type LogEntry = {
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
  readonly fields: LogFields;
};

export class RecordingLogger implements Logger {
  readonly entries: LogEntry[] = [];

  info(event: string, fields: LogFields = {}): void {
    this.entries.push({ level: 'info', event, fields });
  }

  warn(event: string, fields: LogFields = {}): void {
    this.entries.push({ level: 'warn', event, fields });
  }

  error(event: string, fields: LogFields = {}): void {
    this.entries.push({ level: 'error', event, fields });
  }

  find(event: string): LogEntry | undefined {
    return this.entries.find((entry) => entry.event === event);
  }

  serialized(): string {
    return JSON.stringify(this.entries);
  }
}

export class ManualClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

// An unsigned JWT-shaped token with the given `sub`: enough for the BFF, which only reads it for logs.
export function accessTokenFor(sub: string, marker = 'a'): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ sub, marker })}.signature`;
}

// The cookies sealed with a fixed test secret, as the BFF's composition root builds them.
export const TEST_SECRET = 'test-secret-of-at-least-32-characters';
export const testSeal = new CookieSeal(TEST_SECRET);
export const testSessionCookie = new SessionCookie(testSeal);
export const testSignInCookie = new SignInCookie(testSeal);
