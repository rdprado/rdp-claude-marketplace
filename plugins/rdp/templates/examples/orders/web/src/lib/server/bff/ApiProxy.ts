// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — BFF use case: forwards /api/* to the API with the session's access token as
// `Authorization: Bearer`. The API's status and body pass through unchanged; the browser's cookies and
// other headers stay here. The BFF's own failures use the API's error shape: { "error": { "code" } }.
import type { SessionRefresherUseCase } from './SessionRefresher.ts';
import { ApiUnavailableError, type ApiClient } from './ports/ApiClient.ts';
import type { Clock } from './ports/Clock.ts';
import type { CookieJar } from './ports/CookieJar.ts';
import type { Logger } from './ports/Logger.ts';

export type ProxyRequest = {
  readonly method: string;
  readonly pathAndQuery: string;
  readonly route: string;
  readonly contentType: string | null;
  readonly accept: string | null;
  readonly body: ArrayBuffer | null;
  readonly traceparent: string;
  readonly traceId: string;
};

export type ProxyReply = {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: ArrayBuffer | string | null;
  readonly userId: string | null;
  readonly upstreamMs: number | null;
};

type BffErrorCode = 'not-found' | 'session-expired' | 'identity-provider-unavailable' | 'api-unavailable';

const API_PREFIX = '/api/';
// A Response with one of these statuses can't carry a body, not even an empty one.
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

export interface ApiProxyUseCase {
  forward(request: ProxyRequest, cookies: CookieJar): Promise<ProxyReply>;
}

export class ApiProxy implements ApiProxyUseCase {
  constructor(
    private readonly sessions: SessionRefresherUseCase,
    private readonly api: ApiClient,
    private readonly clock: Clock,
    private readonly logger: Logger
  ) {}

  async forward(request: ProxyRequest, cookies: CookieJar): Promise<ProxyReply> {
    // The pathname is already normalized (no `..`); anything outside /api/ never reaches the API.
    if (!request.pathAndQuery.startsWith(API_PREFIX)) return bffError(404, 'not-found', null);

    const lookup = await this.sessions.current(cookies, request.traceId);
    if (lookup.kind === 'none') return bffError(401, 'session-expired', null);
    if (lookup.kind === 'unavailable') return bffError(503, 'identity-provider-unavailable', null);

    const started = this.clock.now().getTime();
    try {
      const response = await this.api.send({
        method: request.method,
        pathAndQuery: request.pathAndQuery,
        headers: upstreamHeaders(request, lookup.session.accessToken),
        body: request.body
      });
      const upstreamMs = this.clock.now().getTime() - started;
      const body = NULL_BODY_STATUSES.has(response.status) ? null : response.body;
      return {
        status: response.status,
        contentType: response.contentType,
        body,
        userId: lookup.session.userId,
        upstreamMs
      };
    } catch (error) {
      if (!(error instanceof ApiUnavailableError)) throw error;
      const upstreamMs = this.clock.now().getTime() - started;
      this.logger.error('proxy.failed', { route: request.route, upstreamMs, traceId: request.traceId });
      return { ...bffError(502, 'api-unavailable', lookup.session.userId), upstreamMs };
    }
  }
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
