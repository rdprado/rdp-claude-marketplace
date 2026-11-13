// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Narrow integration test of the BFF's API proxy: createApiProxy with Node's fetch against a fake API on
// localhost. Checks what reaches the API over HTTP and that its answer passes through unchanged.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApiProxy, type ProxyRequest } from '#bff/api.ts';
import type { SessionLookup } from '#bff/auth.ts';
import { fakeCookieJar, manualClock, recordingLogger } from '../../support/fakes.ts';
import { startFakeHttpServer, type FakeHttpServer } from '../../support/fakeHttpServer.ts';

const ACTIVE: SessionLookup = { kind: 'active', accessToken: 'access-1', userId: 'user-1' };
const TRACEPARENT = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

let api: FakeHttpServer;

beforeAll(async () => {
  api = await startFakeHttpServer();
});

afterAll(() => api.close());

beforeEach(() => {
  api.requests.length = 0;
});

function setup(apiUrl = api.url) {
  return createApiProxy({
    apiUrl,
    currentSession: () => Promise.resolve(ACTIVE),
    fetch,
    now: manualClock(new Date('2026-10-28T12:00:00Z')).now,
    logger: recordingLogger()
  });
}

function request(overrides: Partial<ProxyRequest> = {}): ProxyRequest {
  return {
    method: 'GET',
    pathAndQuery: '/api/v1/orders',
    route: '/api/v1/orders',
    contentType: null,
    accept: 'application/json',
    body: null,
    traceparent: TRACEPARENT,
    traceId: '0af7651916cd43dd8448eb211c80319c',
    clientIp: '203.0.113.7',
    ...overrides
  };
}

const bodyText = (body: ArrayBuffer | string | null) =>
  typeof body === 'string' || body === null ? body : new TextDecoder().decode(body);

describe('api proxy against a fake API', () => {
  it('sends the Bearer token and the traceparent, never the cookie', async () => {
    // Arrange
    api.answerWith(() => ({ status: 200, body: [] }));
    const proxy = setup();

    // Act
    await proxy.forward(request(), fakeCookieJar({ bff_session: 's-1' }));

    // Assert
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]).toMatchObject({ method: 'GET', path: '/api/v1/orders' });
    expect(api.requests[0]?.headers.authorization).toBe('Bearer access-1');
    expect(api.requests[0]?.headers.traceparent).toBe(TRACEPARENT);
    expect(api.requests[0]?.headers.cookie).toBeUndefined();
  });

  it('forwards the body and passes the API answer through unchanged', async () => {
    // Arrange
    api.answerWith(() => ({ status: 409, body: { error: { code: 'client-order-id-reused' } } }));
    const proxy = setup();
    const sent = new TextEncoder().encode('{"symbol":"PETR4"}').buffer;

    // Act
    const reply = await proxy.forward(
      request({ method: 'POST', contentType: 'application/json', body: sent }),
      fakeCookieJar({ bff_session: 's-1' })
    );

    // Assert
    expect(api.requests[0]?.body).toBe('{"symbol":"PETR4"}');
    expect(reply.status).toBe(409);
    expect(JSON.parse(bodyText(reply.body) ?? '')).toEqual({ error: { code: 'client-order-id-reused' } });
  });

  it('answers 502 api-unavailable when nothing listens at the API address', async () => {
    // Arrange
    const closed = await startFakeHttpServer();
    await closed.close();
    const proxy = setup(closed.url);

    // Act
    const reply = await proxy.forward(request(), fakeCookieJar({ bff_session: 's-1' }));

    // Assert
    expect(reply.status).toBe(502);
    expect(JSON.parse(bodyText(reply.body) ?? '')).toEqual({ error: { code: 'api-unavailable' } });
  });
});
