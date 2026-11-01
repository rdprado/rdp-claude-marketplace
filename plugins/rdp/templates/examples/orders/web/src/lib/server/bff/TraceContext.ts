// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — W3C Trace Context: keeps the browser's trace id (or starts one) and makes the
// `traceparent` the BFF forwards to the API, so one request can be followed end to end.
import { randomBytes } from 'node:crypto';

export type TraceContext = {
  readonly traceId: string;
  // The header to send upstream: same trace, the BFF's own span id.
  readonly traceparent: string;
};

// version-traceid-parentid-flags; all-zero ids are invalid per the spec.
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export const TraceContext = {
  fromHeader(header: string | null, newId: (bytes: number) => string = randomHex): TraceContext {
    const match = header ? TRACEPARENT.exec(header.trim()) : null;
    const traceId = match?.[1] && !/^0+$/.test(match[1]) ? match[1] : newId(16);
    const flags = match?.[3] ?? '01';
    return { traceId, traceparent: `00-${traceId}-${newId(8)}-${flags}` };
  }
};

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}
