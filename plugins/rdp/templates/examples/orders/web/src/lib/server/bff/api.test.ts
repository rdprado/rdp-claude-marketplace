// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { createApiProxy, type ProxyRequest } from './api.ts';
import type { Fetch, SessionLookup } from './auth.ts';
import { fakeCookieJar, manualClock, recordingLogger, type ManualClock } from './testing/fakes.ts';

const API = 'http://api.test';
const NOW = new Date('2026-10-28T12:00:00Z');
const ACTIVE: SessionLookup = { kind: 'active', accessToken: 'access-1', userId: 'user-1' };

type ApiCall = { readonly url: string; readonly init: RequestInit };

// A fake API: a fetch that records each call and answers it.
function fakeApi(answer: () => Promise<Response>) {
  const calls: ApiCall[] = [];
  const fetch: Fetch = (url, init) => {
    calls.push({ url, init });
    return answer();
  };
  return { fetch, calls };
}

const json =
  (text: string, status = 200) =>
  () =>
    Promise.resolve(new Response(text, { status, headers: { 'content-type': 'application/json' } }));

function setup(
  answer: () => Promise<Response>,
  lookup: SessionLookup = ACTIVE,
  clock: ManualClock = manualClock(NOW)
) {
  const api = fakeApi(answer);
  const logger = recordingLogger();
  const proxy = createApiProxy({
    apiUrl: API,
    currentSession: () => Promise.resolve(lookup),
    fetch: api.fetch,
    now: clock.now,
    logger
  });
  return { proxy, api, logger };
}

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
    clientIp: '203.0.113.7',
    ...overrides
  };
}

const text = (body: ProxyRequest['body'] | string | null) =>
  typeof body === 'string' || body === null ? body : new TextDecoder().decode(body);

describe('api proxy', () => {
  it('sends the Bearer token and the traceparent, and only allowlisted headers (no Cookie)', async () => {
    // Arrange
    const { proxy, api } = setup(json('[]'));

    // Act
    await proxy.forward(request({ contentType: 'application/json' }), fakeCookieJar({ bff_session: 's-1' }));

    // Assert
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]?.url).toBe(`${API}/api/v1/orders?page=1`);
    expect(api.calls[0]?.init).toMatchObject({
      method: 'GET',
      headers: {
        authorization: 'Bearer access-1',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: null
    });
    expect(Object.keys(api.calls[0]?.init.headers ?? {})).not.toContain('cookie');
  });

  it('passes the status and body of an API error through unchanged', async () => {
    // Arrange
    const errorBody = '{"error":{"code":"client-order-id-reused"}}';
    const { proxy } = setup(json(errorBody, 409));

    // Act
    const reply = await proxy.forward(request({ method: 'POST' }), fakeCookieJar());

    // Assert
    expect(reply.status).toBe(409);
    expect(reply.contentType).toBe('application/json');
    expect(text(reply.body)).toBe(errorBody);
    expect(reply.userId).toBe('user-1');
  });

  it('answers a 204 with no body', async () => {
    // Arrange
    const { proxy } = setup(() => Promise.resolve(new Response(null, { status: 204 })));

    // Act
    const reply = await proxy.forward(request(), fakeCookieJar());

    // Assert
    expect(reply.status).toBe(204);
    expect(reply.body).toBeNull();
  });

  it.each([['/apix/v1/orders'], ['/dev-idp/oauth/token'], ['/api']])(
    'refuses %s without calling the API',
    async (path) => {
      // Arrange
      const { proxy, api } = setup(json('[]'));

      // Act
      const reply = await proxy.forward(request({ pathAndQuery: path }), fakeCookieJar());

      // Assert
      expect(reply.status).toBe(404);
      expect(api.calls).toEqual([]);
    }
  );

  it.each([
    [{ kind: 'none' } as const, 401, 'session-expired'],
    [{ kind: 'ip-changed' } as const, 401, 'ip-changed'],
    [{ kind: 'unavailable' } as const, 503, 'identity-provider-unavailable']
  ])('answers %o with %i %s and does not call the API', async (lookup, status, code) => {
    // Arrange
    const { proxy, api } = setup(json('[]'), lookup);

    // Act
    const reply = await proxy.forward(request(), fakeCookieJar());

    // Assert
    expect(reply.status).toBe(status);
    expect(JSON.parse(text(reply.body) ?? '')).toEqual({ error: { code } });
    expect(api.calls).toEqual([]);
  });

  it("asks for the session with the browser's IP and the trace id", async () => {
    // Arrange
    const asked: unknown[][] = [];
    const proxy = createApiProxy({
      apiUrl: API,
      currentSession: (...args) => {
        asked.push(args);
        return Promise.resolve(ACTIVE);
      },
      fetch: fakeApi(json('[]')).fetch,
      now: manualClock(NOW).now,
      logger: recordingLogger()
    });
    const cookies = fakeCookieJar();

    // Act
    await proxy.forward(request(), cookies);

    // Assert
    expect(asked).toEqual([[cookies, '203.0.113.7', '0af7651916cd43dd8448eb211c80319c']]);
  });

  it('answers 502 api-unavailable and logs proxy.failed when the API is down', async () => {
    // Arrange
    const { proxy, logger } = setup(() => Promise.reject(new TypeError('fetch failed')));

    // Act
    const reply = await proxy.forward(request(), fakeCookieJar());

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
    const clock = manualClock(NOW);
    const answer = () => {
      clock.advance(71);
      return json('[]')();
    };
    const { proxy } = setup(answer, ACTIVE, clock);

    // Act
    const reply = await proxy.forward(request(), fakeCookieJar());

    // Assert
    expect(reply.upstreamMs).toBe(71);
  });
});
