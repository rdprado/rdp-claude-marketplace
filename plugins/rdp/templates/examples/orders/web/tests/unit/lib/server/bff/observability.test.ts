// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { requestLogFields, routeTemplate, traceContext, traceIdOf } from '#bff/observability.ts';

// Deterministic ids: 'b' repeated, so the expected header is known.
const newId = (bytes: number) => 'b'.repeat(bytes * 2);

describe('traceContext', () => {
  it('keeps the browser trace id and flags, with the BFF as the new parent', () => {
    // Act
    const trace = traceContext('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00', newId);

    // Assert
    expect(trace).toEqual({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-bbbbbbbbbbbbbbbb-00'
    });
  });

  it.each([[null], ['garbage'], ['00-00000000000000000000000000000000-b7ad6b7169203331-01']])(
    'starts a new sampled trace when the header is %s',
    (header) => {
      // Act
      const trace = traceContext(header, newId);

      // Assert
      expect(trace).toEqual({
        traceId: 'b'.repeat(32),
        traceparent: `00-${'b'.repeat(32)}-${'b'.repeat(16)}-01`
      });
    }
  );
});

describe('requestLogFields', () => {
  const REQUEST = { method: 'GET', route: '/api/v1/orders', status: 200, traceId: 't-1' };

  it('logs how long the request took, and what the proxy recorded', () => {
    // Act
    const fields = requestLogFields({
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
    const fields = requestLogFields({ ...REQUEST, startedMs: 1_000, endedMs: 1_000 });

    // Assert
    expect(fields).toEqual({ ...REQUEST, durationMs: 0, upstreamMs: null, userId: null });
  });
});

describe('traceIdOf', () => {
  it.each([
    ['the trace id', { traceId: 'abc', traceparent: '00-abc-def-01' }, 'abc'],
    ['an empty trace id as it is', { traceId: '', traceparent: '' }, ''],
    ['none without a trace', undefined, 'none']
  ])('reports %s', (_, trace, expected) => {
    // Act / Assert
    expect(traceIdOf(trace)).toBe(expected);
  });
});

describe('routeTemplate', () => {
  it.each([
    ['/auth/callback', '/auth/callback', '/auth/callback'],
    [null, '/whatever/joe@example.com', 'unmatched'],
    ['/api/[...path]', '/api/v1/orders', '/api/v1/orders'],
    [
      '/api/[...path]',
      '/api/v1/orders/3f2504e0-4f89-11d3-9a0c-0305e82c3301/cancel',
      '/api/v1/orders/:id/cancel'
    ],
    ['/api/[...path]', '/api/v1/orders/42', '/api/v1/orders/:id'],
    ['/api/[...path]', '/api/v1/trainees/joe%40example.com', '/api/v1/trainees/:email']
  ])('logs route %s with path %s as %s', (routeId, pathname, expected) => {
    // Act
    const route = routeTemplate(routeId, pathname);

    // Assert
    expect(route).toBe(expected);
  });
});
