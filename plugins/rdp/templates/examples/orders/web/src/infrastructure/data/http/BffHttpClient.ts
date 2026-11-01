// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — the shared HTTP adapter every gateway uses to call the BFF (same origin; the
// browser sends the HttpOnly session cookie by itself). It handles `401` once for every screen: the
// separate BFF already renews the token, so a 401 here means the session is over.
import type { Clock } from '../../../application/ports/Clock.ts';
import type { Monitoring } from '../../../application/ports/Monitoring.ts';
import { SessionExpiredError, type Session } from '../../../application/ports/Session.ts';

export type BffRequest = {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: string;
  // The template recorded for monitoring, e.g. `/api/v1/orders/:id`.
  readonly route: string;
  readonly body?: unknown;
};

export type BffReply = {
  readonly status: number;
  // The parsed JSON body, or null when there is none.
  readonly body: unknown;
};

export class BffHttpClient {
  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly session: Session,
    private readonly monitoring: Monitoring,
    private readonly clock: Clock
  ) {}

  // Throws SessionExpiredError on 401 (after sending the user to sign in); a network failure throws as is.
  async send(request: BffRequest): Promise<BffReply> {
    const started = this.clock.now().getTime();
    const response = await this.fetchFn(request.path, {
      method: request.method,
      headers: requestHeaders(request),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      credentials: 'same-origin'
    });
    this.monitoring.recordRequest({
      method: request.method,
      route: request.route,
      status: response.status,
      durationMs: this.clock.now().getTime() - started
    });

    if (response.status === 401) {
      this.session.expired();
      throw new SessionExpiredError();
    }
    return { status: response.status, body: await readJson(response) };
  }
}

function requestHeaders(request: BffRequest): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (request.body !== undefined) headers['content-type'] = 'application/json';
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // not JSON (e.g. a proxy's HTML error page): toResult decides from the status
  }
}
