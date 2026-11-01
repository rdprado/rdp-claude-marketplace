// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Integration test of the BFF: the real entry (hooks.server.ts + the /auth and /api routes, with the
// real adapters and pino) against a fake identity provider and a fake API over real HTTP on localhost.
// Only SvelteKit's request plumbing is stood in for, by `Browser` below.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isRedirect, type RequestEvent } from '@sveltejs/kit';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The configuration is the committed config/appsettings.json, with the URLs overridden through
// environment variables (Api__Url, ...) once the fakes below listen; the BFF reads it on the first request.
const REDIRECT_URI = 'http://app.test/auth/callback';

const { handle, handleError } = await import('./hooks.server.ts');
const signinRoute = await import('./routes/auth/signin/+server.ts');
const callbackRoute = await import('./routes/auth/callback/+server.ts');
const signoutRoute = await import('./routes/auth/signout/+server.ts');
const apiRoute = await import('./routes/api/[...path]/+server.ts');

const APP = 'http://app.test';
const USER_ID = '6f1c1d5e-2b7a-4c3e-9f4e-0d6a2b9c8e11';
const START = new Date('2026-10-28T12:00:00Z');

// ---------- Fake identity provider: codes, rotating refresh tokens, reuse revokes the sign-in ----------

const issuedTokens: string[] = [];
const refreshTokens = new Map<string, 'active' | 'rotated' | 'revoked'>();
const revokeCalls: string[] = [];
let tokenCounter = 0;

function issueTokens() {
  tokenCounter += 1;
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${part({ alg: 'RS256' })}.${part({ sub: USER_ID, n: tokenCounter })}.sig${tokenCounter}`;
  const refreshToken = `refresh-${tokenCounter}-opaque`;
  issuedTokens.push(accessToken, refreshToken);
  refreshTokens.set(refreshToken, 'active');
  return { access_token: accessToken, refresh_token: refreshToken, expires_in: 300 };
}

function identityProvider(form: URLSearchParams, path: string): { status: number; body: object } {
  if (path === '/dev-idp/revoke') {
    revokeCalls.push(form.get('token') ?? '');
    refreshTokens.set(form.get('token') ?? '', 'revoked');
    return { status: 200, body: {} };
  }
  if (form.get('grant_type') === 'authorization_code') {
    const valid =
      form.get('code') === 'good-code' &&
      form.get('code_verifier') &&
      form.get('redirect_uri') === REDIRECT_URI;
    return valid ? { status: 200, body: issueTokens() } : { status: 400, body: { error: 'invalid_grant' } };
  }
  const token = form.get('refresh_token') ?? '';
  if (refreshTokens.get(token) !== 'active') {
    refreshTokens.forEach((_, key) => refreshTokens.set(key, 'revoked')); // reuse: revoke the sign-in
    return { status: 400, body: { error: 'invalid_grant' } };
  }
  refreshTokens.set(token, 'rotated');
  return { status: 200, body: issueTokens() };
}

// ---------- Fake API: records what reached it ----------

const apiCalls: { method: string; url: string; headers: IncomingMessage['headers'] }[] = [];

function api(request: IncomingMessage): { status: number; body: object } {
  apiCalls.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers });
  if (request.method === 'GET') return { status: 200, body: [] };
  return { status: 409, body: { error: { code: 'order-not-open' } } };
}

let upstream: Server;

beforeAll(async () => {
  upstream = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    const answer = path.startsWith('/dev-idp/')
      ? identityProvider(new URLSearchParams(Buffer.concat(chunks).toString()), path)
      : api(request);
    response
      .writeHead(answer.status, { 'content-type': 'application/json' })
      .end(JSON.stringify(answer.body));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  vi.stubEnv('Api__Url', base);
  vi.stubEnv('IdentityProvider__Url', `${base}/dev-idp`);
  vi.stubEnv('IdentityProvider__RedirectUri', REDIRECT_URI);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => upstream.close(resolve));
});

// ---------- Logs: the real PinoLogger writes JSON lines to stdout ----------

let logLines: string[] = [];

function clearLogs(): void {
  logLines = [];
}

beforeEach(() => {
  logLines = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    logLines.push(String(chunk));
    return true;
  });
});

function logged(event: string): Record<string, unknown>[] {
  return logLines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((entry) => entry.event === event);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------- A browser talking to the entry the way SvelteKit would ----------

type Sent = { response: Response; text: string; setCookies: string[] };

const ROUTES: { pattern: RegExp; id: string; handlers: Record<string, unknown> }[] = [
  { pattern: /^\/auth\/signin$/, id: '/auth/signin', handlers: signinRoute },
  { pattern: /^\/auth\/callback$/, id: '/auth/callback', handlers: callbackRoute },
  { pattern: /^\/auth\/signout$/, id: '/auth/signout', handlers: signoutRoute },
  { pattern: /^\/api(\/|$)/, id: '/api/[...path]', handlers: apiRoute }
];

class Browser {
  readonly jar = new Map<string, string>();
  readonly responses: Sent[] = [];

  async send(method: string, path: string, init: { origin?: string; body?: string } = {}): Promise<Sent> {
    const url = new URL(path, APP);
    const headers = new Headers({ 'content-type': 'application/json' });
    if (init.origin) headers.set('origin', init.origin);
    const request = new Request(url, { method, headers, body: init.body });
    const setCookies: string[] = [];
    const route = ROUTES.find((r) => r.pattern.test(url.pathname));
    const event = {
      request,
      url,
      route: { id: route?.id ?? null },
      params: {},
      locals: {},
      cookies: this.cookies(setCookies)
    } as unknown as RequestEvent;

    const response = await handle({ event, resolve: (e) => this.resolve(e, route?.handlers, setCookies) });
    const sent = { response, text: await response.text(), setCookies };
    this.responses.push(sent);
    return sent;
  }

  // What SvelteKit's resolve does for an endpoint: call it, turn a thrown redirect into a response.
  private async resolve(
    event: RequestEvent,
    handlers: Record<string, unknown> | undefined,
    setCookies: string[]
  ) {
    const handler = (handlers?.[event.request.method] ?? handlers?.fallback) as
      ((e: RequestEvent) => Promise<Response> | Response) | undefined;
    if (!handler) return new Response('not found', { status: 404 });
    let response: Response;
    try {
      response = await handler(event);
    } catch (error) {
      if (!isRedirect(error)) throw error;
      response = new Response(null, { status: error.status, headers: { location: error.location } });
    }
    setCookies.forEach((cookie) => response.headers.append('set-cookie', cookie));
    return response;
  }

  private cookies(setCookies: string[]) {
    return {
      get: (name: string) => this.jar.get(name),
      set: (
        name: string,
        value: string,
        options: { httpOnly: boolean; secure: boolean; sameSite: string; path: string }
      ) => {
        this.jar.set(name, value);
        const flags = [
          options.httpOnly && 'HttpOnly',
          options.secure && 'Secure',
          `SameSite=${options.sameSite}`
        ];
        setCookies.push(`${name}=${value}; Path=${options.path}; ${flags.filter(Boolean).join('; ')}`);
      },
      delete: (name: string, options: { path: string }) => {
        this.jar.delete(name);
        setCookies.push(`${name}=; Path=${options.path}; Max-Age=0`);
      }
    };
  }
}

async function signedInBrowser(): Promise<Browser> {
  const browser = new Browser();
  const start = await browser.send('GET', '/auth/signin');
  const state = new URL(start.response.headers.get('location') ?? '').searchParams.get('state');
  await browser.send('GET', `/auth/callback?code=good-code&state=${state}`);
  return browser;
}

// Everything the browser received, except the HttpOnly Set-Cookie headers, which page JS can't read.
function readableByPageScript(browser: Browser): string {
  return browser.responses
    .map((sent) => {
      const headers = [...sent.response.headers].filter(([name]) => name !== 'set-cookie');
      return JSON.stringify(headers) + sent.text;
    })
    .join('\n');
}

describe('BFF entry', () => {
  it('signs in with PKCE, proxies with the Bearer token, and the token never reaches page script', async () => {
    // Arrange
    clearLogs();
    const browser = new Browser();

    // Act
    const start = await browser.send('GET', '/auth/signin');
    const authorize = new URL(start.response.headers.get('location') ?? '');
    const callback = await browser.send(
      'GET',
      `/auth/callback?code=good-code&state=${authorize.searchParams.get('state')}`
    );
    const orders = await browser.send('GET', '/api/v1/orders');

    // Assert
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(callback.response.status).toBe(303);
    expect(callback.response.headers.get('location')).toBe('/');
    expect(callback.setCookies.find((c) => c.startsWith('bff_session='))).toMatch(
      /HttpOnly; Secure; SameSite=lax/
    );
    expect(orders.response.status).toBe(200);
    expect(orders.text).toBe('[]');

    const reached = apiCalls.at(-1);
    expect(reached?.headers.authorization).toMatch(/^Bearer .+\..+\..+$/);
    expect(reached?.headers.cookie).toBeUndefined();
    expect(reached?.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    const readable = readableByPageScript(browser);
    issuedTokens.forEach((token) => expect(readable).not.toContain(token));
    const cookieValues = [...browser.jar.values()].join(' ');
    issuedTokens.forEach((token) => expect(cookieValues).not.toContain(token));
    expect(cookieValues).not.toContain('eyJ');
    expect(logged('signin.ok')).toEqual([expect.objectContaining({ level: 'info', userId: USER_ID })]);
    expect(logged('request').map((line) => line.route)).toEqual([
      '/auth/signin',
      '/auth/callback',
      '/api/v1/orders'
    ]);
  });

  it('refuses a mutating request from another origin and logs csrf.rejected', async () => {
    // Arrange
    const browser = await signedInBrowser();
    clearLogs();
    const callsBefore = apiCalls.length;

    // Act
    const sent = await browser.send('POST', '/api/v1/orders', { origin: 'https://evil.example', body: '{}' });

    // Assert
    expect(sent.response.status).toBe(403);
    expect(JSON.parse(sent.text)).toEqual({ error: { code: 'csrf-rejected' } });
    expect(apiCalls.length).toBe(callsBefore);
    expect(logged('csrf.rejected')).toEqual([expect.objectContaining({ level: 'warn', method: 'POST' })]);
  });

  it('passes a same-origin mutating request and the API error through unchanged', async () => {
    // Arrange
    const browser = await signedInBrowser();

    // Act
    const sent = await browser.send('POST', '/api/v1/orders/3f2504e0-4f89-11d3-9a0c-0305e82c3301/cancel', {
      origin: APP
    });

    // Assert
    expect(sent.response.status).toBe(409);
    expect(JSON.parse(sent.text)).toEqual({ error: { code: 'order-not-open' } });
  });

  it('renews an expired token, then logs refresh.reused when the old cookie comes back', async () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    const browser = await signedInBrowser();
    const stolen = new Map(browser.jar); // a copy of the cookie before the renewal
    vi.setSystemTime(new Date(START.getTime() + 5 * 60_000));
    clearLogs();
    await browser.send('GET', '/api/v1/orders'); // renews: the refresh token rotates
    vi.setSystemTime(new Date(START.getTime() + 5 * 60_000 + 6_000)); // past the 5 s grace
    const attacker = new Browser();
    stolen.forEach((value, name) => attacker.jar.set(name, value));

    // Act
    const replay = await attacker.send('GET', '/api/v1/orders');

    // Assert
    expect(logged('refresh.ok')).toHaveLength(1);
    expect(replay.response.status).toBe(401);
    expect(JSON.parse(replay.text)).toEqual({ error: { code: 'session-expired' } });
    expect(logged('refresh.reused')).toEqual([expect.objectContaining({ level: 'error', userId: USER_ID })]);
    const logs = logLines.join('\n');
    issuedTokens.forEach((token) => expect(logs).not.toContain(token));
  });

  it('signs out: revokes the refresh token and clears the session cookie', async () => {
    // Arrange
    const browser = await signedInBrowser();
    clearLogs();

    // Act
    const sent = await browser.send('POST', '/auth/signout', { origin: APP });

    // Assert
    expect(sent.response.status).toBe(303);
    expect(sent.response.headers.get('location')).toBe('/signed-out');
    expect(browser.jar.has('bff_session')).toBe(false);
    expect(revokeCalls.at(-1)).toMatch(/^refresh-\d+-opaque$/);
    expect(logged('signout')).toEqual([expect.objectContaining({ revoked: true, userId: USER_ID })]);
  });

  it('logs signin.failed and sets no session when the code is rejected', async () => {
    // Arrange
    const browser = new Browser();
    const start = await browser.send('GET', '/auth/signin');
    const state = new URL(start.response.headers.get('location') ?? '').searchParams.get('state');
    clearLogs();

    // Act
    const sent = await browser.send('GET', `/auth/callback?code=bad-code&state=${state}`);

    // Assert
    expect(sent.response.headers.get('location')).toBe('/signed-out');
    expect(browser.jar.has('bff_session')).toBe(false);
    expect(logged('signin.failed')).toEqual([
      expect.objectContaining({ level: 'warn', reason: 'invalid_code' })
    ]);
    expect(logLines.join('\n')).not.toContain('bad-code');
  });
});

describe('BFF handleError', () => {
  const event = {
    route: { id: '/api/[...path]' },
    url: new URL(`${APP}/api/v1/orders/42`),
    locals: {}
  } as unknown as RequestEvent;

  it('reports an unexpected exception with its stack and the route template', async () => {
    // Act
    await handleError({ kind: 'unknown', error: new Error('boom'), event });

    // Assert
    const [entry] = logged('unexpected');
    expect(entry).toMatchObject({ level: 'error', route: '/api/v1/orders/:id', traceId: 'none' });
    expect((entry?.error as { stack: string }).stack).toContain('boom');
  });

  it('does not report SvelteKit errors such as a 404', async () => {
    // Act
    await handleError({ kind: 'framework', error: { status: 404, message: 'Not Found' }, event });

    // Assert
    expect(logged('unexpected')).toEqual([]);
  });
});
