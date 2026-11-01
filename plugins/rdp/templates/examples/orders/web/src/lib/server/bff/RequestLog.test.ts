// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { RequestLog } from './RequestLog.ts';

const REQUEST = { method: 'GET', route: '/api/v1/orders', status: 200, traceId: 't-1' };

describe('RequestLog', () => {
  it('logs how long the request took, and what the proxy recorded', () => {
    // Act
    const fields = RequestLog.fields({
      ...REQUEST,
      startedMs: 1_000,
      endedMs: 1_250,
      upstreamMs: 0,
      userId: ''
    });

    // Assert: 0 and '' are values, not "missing"
    expect(fields).toEqual({ ...REQUEST, durationMs: 250, upstreamMs: 0, userId: '' });
  });

  it('logs null for what only the proxy route sets', () => {
    // Act
    const fields = RequestLog.fields({ ...REQUEST, startedMs: 1_000, endedMs: 1_000 });

    // Assert
    expect(fields).toEqual({ ...REQUEST, durationMs: 0, upstreamMs: null, userId: null });
  });

  it.each([
    ['the trace id', { traceId: 'abc', traceparent: '00-abc-def-01' }, 'abc'],
    ['an empty trace id as it is', { traceId: '', traceparent: '' }, ''],
    ['none without a trace', undefined, 'none']
  ])('reports %s', (_, trace, expected) => {
    // Act / Assert
    expect(RequestLog.traceIdOf(trace)).toBe(expected);
  });
});
