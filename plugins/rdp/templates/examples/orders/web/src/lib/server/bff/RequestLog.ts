// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — the fields of the request log line and of an error report (hooks.server.ts).
import type { TraceContext } from './TraceContext.ts';

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

export const RequestLog = {
  fields(input: RequestLogInput) {
    return {
      method: input.method,
      route: input.route,
      status: input.status,
      durationMs: input.endedMs - input.startedMs,
      upstreamMs: input.upstreamMs ?? null,
      traceId: input.traceId,
      userId: input.userId ?? null
    };
  },

  // An error can happen before the request has its trace.
  traceIdOf(trace: TraceContext | undefined): string {
    return trace?.traceId ?? 'none';
  }
};
