// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it, vi } from 'vitest';
import { ApiProxy, type ProxyRequest } from './ApiProxy.ts';
import type { SessionLookup, SessionRefresherUseCase } from './SessionRefresher.ts';
import { ApiUnavailableError, type ApiClient, type ApiRequest, type ApiResponse } from './ports/ApiClient.ts';
import { FakeCookieJar, ManualClock, RecordingLogger } from './testing/fakes.ts';

const NOW = new Date('2026-10-28T12:00:00Z');
const ACTIVE: SessionLookup = { kind: 'active', session: { accessToken: 'access-1', userId: 'user-1' } };

function sessions(lookup: SessionLookup): SessionRefresherUseCase {
  return { current: () => Promise.resolve(lookup) };
}

function apiAnswering(send: (request: ApiRequest) => Promise<ApiResponse>) {
  const fake = { send: vi.fn(send) };
  return fake satisfies ApiClient;
}

const okJson = (text: string, status = 200): Promise<ApiResponse> =>
  Promise.resolve({ status, contentType: 'application/json', body: new TextEncoder().encode(text).buffer });

function request(overrides: Partial<ProxyRequest> = {}): ProxyRequest {
  return {
    method: 'GET',
    pathAndQuery: '/api/v1/orders?page=1',
    route: '/api/v1/orders',
    contentType: null,
    accept: 'application/json',
    body: null,
    traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    traceId: '0af7651916cd43dd8448eb211c80319c',
    ...overrides
  };
}

const text = (body: ProxyRequest['body'] | string | null) =>
  typeof body === 'string' || body === null ? body : new TextDecoder().decode(body);

describe('ApiProxy', () => {
  it('sends the Bearer token and the traceparent, and only allowlisted headers', async () => {
    // Arrange
    const api = apiAnswering(() => okJson('[]'));
    const proxy = new ApiProxy(sessions(ACTIVE), api, new ManualClock(NOW), new RecordingLogger());

    // Act
    await proxy.forward(request({ contentType: 'application/json' }), new FakeCookieJar());

    // Assert
    expect(api.send).toHaveBeenCalledWith({
      method: 'GET',
      pathAndQuery: '/api/v1/orders?page=1',
      headers: {
        authorization: 'Bearer access-1',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: null
    });
  });

  it('passes the status and body of an API error through unchanged', async () => {
    // Arrange
    const errorBody = '{"error":{"code":"order-not-open"}}';
    const proxy = new ApiProxy(
      sessions(ACTIVE),
      apiAnswering(() => okJson(errorBody, 409)),
      new ManualClock(NOW),
      new RecordingLogger()
    );

    // Act
    const reply = await proxy.forward(request({ method: 'POST' }), new FakeCookieJar());

    // Assert
    expect(reply.status).toBe(409);
    expect(text(reply.body)).toBe(errorBody);
    expect(reply.userId).toBe('user-1');
  });

  it('answers a 204 with no body', async () => {
    // Arrange
    const proxy = new ApiProxy(
      sessions(ACTIVE),
      apiAnswering(() => okJson('', 204)),
      new ManualClock(NOW),
      new RecordingLogger()
    );

    // Act
    const reply = await proxy.forward(request(), new FakeCookieJar());

    // Assert
    expect(reply.status).toBe(204);
    expect(reply.body).toBeNull();
  });

  it.each([['/apix/v1/orders'], ['/dev-idp/token'], ['/api']])(
    'refuses %s without calling the API',
    async (path) => {
      // Arrange
      const api = apiAnswering(() => okJson('[]'));
      const proxy = new ApiProxy(sessions(ACTIVE), api, new ManualClock(NOW), new RecordingLogger());

      // Act
      const reply = await proxy.forward(request({ pathAndQuery: path }), new FakeCookieJar());

      // Assert
      expect(reply.status).toBe(404);
      expect(api.send).not.toHaveBeenCalled();
    }
  );

  it.each([
    [{ kind: 'none' } as const, 401, 'session-expired'],
    [{ kind: 'unavailable' } as const, 503, 'identity-provider-unavailable']
  ])('answers %o with %i %s and does not call the API', async (lookup, status, code) => {
    // Arrange
    const api = apiAnswering(() => okJson('[]'));
    const proxy = new ApiProxy(sessions(lookup), api, new ManualClock(NOW), new RecordingLogger());

    // Act
    const reply = await proxy.forward(request(), new FakeCookieJar());

    // Assert
    expect(reply.status).toBe(status);
    expect(JSON.parse(text(reply.body) ?? '')).toEqual({ error: { code } });
    expect(api.send).not.toHaveBeenCalled();
  });

  it('answers 502 api-unavailable and logs proxy.failed when the API is down', async () => {
    // Arrange
    const logger = new RecordingLogger();
    const proxy = new ApiProxy(
      sessions(ACTIVE),
      apiAnswering(() => Promise.reject(new ApiUnavailableError())),
      new ManualClock(NOW),
      logger
    );

    // Act
    const reply = await proxy.forward(request(), new FakeCookieJar());

    // Assert
    expect(reply.status).toBe(502);
    expect(JSON.parse(text(reply.body) ?? '')).toEqual({ error: { code: 'api-unavailable' } });
    expect(logger.find('proxy.failed')).toEqual({
      level: 'error',
      event: 'proxy.failed',
      fields: { route: '/api/v1/orders', upstreamMs: 0, traceId: '0af7651916cd43dd8448eb211c80319c' }
    });
  });

  it('measures the time spent in the API', async () => {
    // Arrange
    const clock = new ManualClock(NOW);
    const api = apiAnswering(() => {
      clock.advance(71);
      return okJson('[]');
    });
    const proxy = new ApiProxy(sessions(ACTIVE), api, clock, new RecordingLogger());

    // Act
    const reply = await proxy.forward(request(), new FakeCookieJar());

    // Assert
    expect(reply.upstreamMs).toBe(71);
  });
});
