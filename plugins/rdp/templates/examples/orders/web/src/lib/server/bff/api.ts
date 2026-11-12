// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// The BFF's proxy to the API: forwards /api/* with the session's access token as `Authorization: Bearer`.
// The API's status and body pass through unchanged; the browser's cookies and other headers stay here.
// The BFF's own failures use the API's error shape: { "error": { "code" } }.
import type { CookieJar, Fetch, SessionLookup } from './auth.ts';
import type { Logger } from './observability.ts';

export type ProxyRequest = {
  readonly method: string;
  // Path and query as the browser sent them, e.g. `/api/v1/orders?x=1`.
  readonly pathAndQuery: string;
  readonly route: string;
  readonly contentType: string | null;
  readonly accept: string | null;
  readonly body: ArrayBuffer | null;
  readonly traceparent: string;
  readonly traceId: string;
  // The browser's IP, from the connection (null: none): the identity provider checks it on a refresh.
  readonly clientIp: string | null;
};

export type ProxyReply = {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: ArrayBuffer | string | null;
  readonly userId: string | null;
  readonly upstreamMs: number | null;
};

export type ApiProxyOptions = {
  readonly apiUrl: string;
  // The auth module's `currentSession`: the access token, renewed when needed.
  readonly currentSession: (
    cookies: CookieJar,
    clientIp: string | null,
    traceId: string
  ) => Promise<SessionLookup>;
  readonly fetch: Fetch;
  readonly now: () => Date;
  readonly logger: Logger;
};

export type ApiProxy = ReturnType<typeof createApiProxy>;

type BffErrorCode =
  'not-found' | 'session-expired' | 'ip-changed' | 'identity-provider-unavailable' | 'api-unavailable';
type Upstream = { readonly status: number; readonly contentType: string | null; readonly body: ArrayBuffer };

const API_PREFIX = '/api/';
// A Response with one of these statuses can't carry a body, not even an empty one.
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

export function createApiProxy(options: ApiProxyOptions) {
  const { apiUrl, currentSession, fetch, now, logger } = options;

  // null: the API can't be reached.
  async function send(request: ProxyRequest, accessToken: string): Promise<Upstream | null> {
    try {
      const response = await fetch(`${apiUrl}${request.pathAndQuery}`, {
        method: request.method,
        headers: upstreamHeaders(request, accessToken),
        body: request.body,
        redirect: 'manual'
      });
      const body = await response.arrayBuffer();
      return { status: response.status, contentType: response.headers.get('content-type'), body };
    } catch {
      return null;
    }
  }

  async function forward(request: ProxyRequest, cookies: CookieJar): Promise<ProxyReply> {
    // The pathname is already normalized (no `..`); anything outside /api/ never reaches the API.
    if (!request.pathAndQuery.startsWith(API_PREFIX)) return bffError(404, 'not-found', null);

    const session = await currentSession(cookies, request.clientIp, request.traceId);
    if (session.kind === 'none') return bffError(401, 'session-expired', null);
    if (session.kind === 'ip-changed') return bffError(401, 'ip-changed', null);
    if (session.kind === 'unavailable') return bffError(503, 'identity-provider-unavailable', null);

    const started = now().getTime();
    const response = await send(request, session.accessToken);
    const upstreamMs = now().getTime() - started;
    if (response === null) {
      logger.error('proxy.failed', { route: request.route, upstreamMs, traceId: request.traceId });
      return { ...bffError(502, 'api-unavailable', session.userId), upstreamMs };
    }
    return {
      status: response.status,
      contentType: response.contentType,
      body: NULL_BODY_STATUSES.has(response.status) ? null : response.body,
      userId: session.userId,
      upstreamMs
    };
  }

  return { forward };
}

// An allowlist, not a copy: the browser's Cookie (and anything else) never reaches the API.
function upstreamHeaders(request: ProxyRequest, accessToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    traceparent: request.traceparent
  };
  if (request.contentType) headers['content-type'] = request.contentType;
  if (request.accept) headers.accept = request.accept;
  return headers;
}

function bffError(status: number, code: BffErrorCode, userId: string | null): ProxyReply {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code } }),
    userId,
    upstreamMs: null
  };
}
