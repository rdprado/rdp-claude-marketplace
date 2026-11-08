// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// The BFF's logs and tracing: the pino logger, unexpected errors, the request log line, the route
// template and the W3C `traceparent`.
import { randomBytes } from 'node:crypto';
import { pino, type DestinationStream } from 'pino';

export type LogFields = Readonly<Record<string, unknown>>;

// One event name + fields. Never pass tokens, cookies, sign-in codes, emails or bodies in the fields.
export type Logger = {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

// Safety net only: the modules never pass these. `*.x` catches them one level down too.
const REDACTED = ['token', 'cookie', 'authorization', 'code'].flatMap((key) => [key, `*.${key}`]);

// One JSON line per event on stdout. The host collects stdout and ships it to the project's log tool;
// the app never writes log files. `destination` lets a test pass its own stream.
export function createLogger(level = 'info', destination: DestinationStream = process.stdout): Logger {
  const logger = pino(
    {
      level,
      base: null,
      messageKey: 'event',
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACTED, censor: '[redacted]' }
    },
    destination
  );
  return {
    info: (event, fields = {}) => logger.info(fields, event),
    warn: (event, fields = {}) => logger.warn(fields, event),
    error: (event, fields = {}) => logger.error(fields, event)
  };
}

// Unexpected errors, with their stack. RDP hasn't chosen the monitoring tool yet: until the project picks
// one (e.g. Sentry), they go to the log. Swap this body for the tool's SDK call; nothing else changes.
export function reportUnexpected(
  logger: Logger,
  error: unknown,
  context: Readonly<Record<string, string>>
): void {
  const { name, message, stack } = error instanceof Error ? error : new Error(String(error));
  logger.error('unexpected', { ...context, error: { name, message, stack } });
}

export type TraceContext = {
  readonly traceId: string;
  // The header to send upstream: same trace, the BFF's own span id.
  readonly traceparent: string;
};

// version-traceid-parentid-flags; all-zero ids are invalid per the spec.
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

// Keeps the browser's trace id (or starts one), so one request can be followed from the browser to the API.
export function traceContext(
  header: string | null,
  newId: (bytes: number) => string = randomHex
): TraceContext {
  const match = header ? TRACEPARENT.exec(header.trim()) : null;
  const traceId = match?.[1] && !/^0+$/.test(match[1]) ? match[1] : newId(16);
  const flags = match?.[3] ?? '01';
  return { traceId, traceparent: `00-${traceId}-${newId(8)}-${flags}` };
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

const ID_SEGMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

// The route to log: a template, never the real path (paths can carry ids, emails). SvelteKit's route id
// for its own routes; for the API catch-all, the path with ids replaced.
export function routeTemplate(routeId: string | null, pathname: string): string {
  if (routeId === null) return 'unmatched';
  if (!routeId.includes('[...')) return routeId;
  return pathname.split('/').map(templateSegment).join('/');
}

function templateSegment(segment: string): string {
  if (ID_SEGMENT.test(segment)) return ':id';
  if (segment.includes('@') || segment.includes('%40')) return ':email';
  return segment;
}

export type RequestLogInput = {
  readonly method: string;
  readonly route: string;
  readonly status: number;
  readonly startedMs: number;
  readonly endedMs: number;
  readonly traceId: string;
  // Set by the /api proxy route only.
  readonly upstreamMs?: number | null;
  readonly userId?: string | null;
};

// The fields of the one `request` line each request logs.
export function requestLogFields(input: RequestLogInput) {
  return {
    method: input.method,
    route: input.route,
    status: input.status,
    durationMs: input.endedMs - input.startedMs,
    upstreamMs: input.upstreamMs ?? null,
    traceId: input.traceId,
    userId: input.userId ?? null
  };
}

// An error can happen before the request has its trace.
export function traceIdOf(trace: TraceContext | undefined): string {
  return trace?.traceId ?? 'none';
}
