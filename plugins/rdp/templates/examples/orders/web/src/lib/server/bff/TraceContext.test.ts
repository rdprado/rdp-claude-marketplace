// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { TraceContext } from './TraceContext.ts';

// Deterministic ids: 'b' repeated, so the expected header is known.
const newId = (bytes: number) => 'b'.repeat(bytes * 2);

describe('TraceContext', () => {
  it('keeps the browser trace id and flags, with the BFF as the new parent', () => {
    // Act
    const trace = TraceContext.fromHeader('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00', newId);

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
      const trace = TraceContext.fromHeader(header, newId);

      // Assert
      expect(trace).toEqual({
        traceId: 'b'.repeat(32),
        traceparent: `00-${'b'.repeat(32)}-${'b'.repeat(16)}-01`
      });
    }
  );
});
