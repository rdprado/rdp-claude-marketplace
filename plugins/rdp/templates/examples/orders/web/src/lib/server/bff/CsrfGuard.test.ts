// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { CsrfGuard, type IncomingRequest } from './CsrfGuard.ts';
import { RecordingLogger } from './testing/fakes.ts';

const APP = 'https://app.example';

function incoming(
  method: string,
  origin: string | null,
  secFetchSite: string | null = null
): IncomingRequest {
  return { method, route: '/api/v1/orders', origin, secFetchSite, appOrigin: APP };
}

describe('CsrfGuard', () => {
  it.each([
    ['a GET from another site', incoming('GET', 'https://evil.example')],
    ['a POST from the app', incoming('POST', APP)],
    ['a PUT from the app', incoming('PUT', APP)],
    ['a POST without Origin but same-origin fetch metadata', incoming('POST', null, 'same-origin')]
  ])('allows %s', (_, request) => {
    // Act
    const refusal = new CsrfGuard(new RecordingLogger()).check(request, 'trace-1');

    // Assert
    expect(refusal).toBeNull();
  });

  it.each([
    ['a POST from another site', incoming('POST', 'https://evil.example')],
    ['a DELETE from a sibling port', incoming('DELETE', 'https://app.example:8443')],
    ['a POST without Origin from another site', incoming('POST', null, 'cross-site')],
    ['a POST with no origin information at all', incoming('POST', null, null)]
  ])('refuses %s with a 403 csrf-rejected and logs csrf.rejected', (_, request) => {
    // Arrange
    const logger = new RecordingLogger();

    // Act
    const refusal = new CsrfGuard(logger).check(request, 'trace-1');

    // Assert
    expect(refusal).toEqual({ status: 403, body: { error: { code: 'csrf-rejected' } } });
    expect(logger.find('csrf.rejected')).toEqual({
      level: 'warn',
      event: 'csrf.rejected',
      fields: { method: request.method, route: '/api/v1/orders', traceId: 'trace-1' }
    });
  });
});
