// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Tests only: plain fakes of what the BFF modules take as parameters (cookies, clock, logger).
import type { CookieJar, CookieOptions, Schedule } from '#bff/auth.ts';
import type { LogFields, Logger } from '#bff/observability.ts';

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

export type FakeScheduler = {
  readonly schedule: Schedule;
  // Moves the clock `ms` forward and runs every task due by then (and the ones they schedule).
  runDue(ms: number): void;
  // Runs the next task `early` ms before it is due: a real timer can fire a little early.
  fireEarly(early: number): void;
  // The ms left for each pending task.
  pendingDelays(): number[];
};

// A Schedule on the manual clock: tasks run only when the test says so.
export function fakeScheduler(clock: ManualClock): FakeScheduler {
  let tasks: { readonly at: number; readonly run: () => void }[] = [];
  const nowMs = () => clock.now().getTime();
  const take = (task: (typeof tasks)[number]) => {
    tasks = tasks.filter((other) => other !== task);
    task.run();
  };
  return {
    schedule: (delayMs, run) => {
      tasks.push({ at: nowMs() + delayMs, run });
    },
    runDue: (ms) => {
      clock.advance(ms);
      for (let due = tasks.find((t) => t.at <= nowMs()); due; due = tasks.find((t) => t.at <= nowMs()))
        take(due);
    },
    fireEarly: (early) => {
      const next = [...tasks].sort((a, b) => a.at - b.at)[0];
      if (!next) return;
      clock.advance(next.at - early - nowMs());
      take(next);
    },
    pendingDelays: () => tasks.map((task) => task.at - nowMs())
  };
}
