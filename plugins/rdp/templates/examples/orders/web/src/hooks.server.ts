// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// The BFF entry (SvelteKit server hooks): builds the BFF modules once per process, the only place with the
// real `fetch`, clock and logger, and wraps every request with the trace, the CSRF check and the log line.
import { json } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { createApiProxy, type ApiProxy } from '#bff/api.ts';
import { createAuth, type Auth } from '#bff/auth.ts';
import {
  createLogger,
  reportUnexpected,
  requestLogFields,
  routeTemplate,
  traceContext,
  traceIdOf,
  type Logger
} from '#bff/observability.ts';
import { readAppSettings } from './lib/server/appSettings.ts';

type Bff = { readonly auth: Auth; readonly api: ApiProxy; readonly logger: Logger; readonly now: () => Date };

let built: Bff | null = null;

// Built when the server starts (not at import: `vite build` loads this module, and the config files are
// read only when the server runs). One per process: the sessions and the shared renewals live in it.
export const init: ServerInit = () => {
  built = buildBff();
};

function bff(): Bff {
  built ??= buildBff();
  return built;
}

function buildBff(): Bff {
  const config = readAppSettings();
  const now = () => new Date();
  const logger = createLogger();
  const auth = createAuth({ idpUrl: config.idpUrl, redirectUri: config.authRedirectUri, fetch, now, logger });
  const api = createApiProxy({
    apiUrl: config.apiUrl,
    currentSession: auth.currentSession,
    fetch,
    now,
    logger
  });
  return { auth, api, logger, now };
}

// Every request: trace context, CSRF check, then the route, then one log line.
export const handle: Handle = async ({ event, resolve }) => {
  const { auth, api, logger, now } = bff();
  const started = now().getTime();
  const trace = traceContext(event.request.headers.get('traceparent'));
  const route = routeTemplate(event.route.id, event.url.pathname);
  event.locals.auth = auth;
  event.locals.api = api;
  event.locals.trace = trace;

  // `event.url.origin` is the public origin: behind a reverse proxy, set adapter-node's ORIGIN.
  const refusal = auth.checkCsrf(
    {
      method: event.request.method,
      route,
      origin: event.request.headers.get('origin'),
      secFetchSite: event.request.headers.get('sec-fetch-site'),
      appOrigin: event.url.origin
    },
    trace.traceId
  );
  const response = refusal ? json(refusal.body, { status: refusal.status }) : await resolve(event);

  logger.info(
    'request',
    requestLogFields({
      method: event.request.method,
      route,
      status: response.status,
      startedMs: started,
      endedMs: now().getTime(),
      traceId: trace.traceId,
      upstreamMs: event.locals.upstreamMs,
      userId: event.locals.userId
    })
  );
  return response;
};

// Unexpected exceptions only; SvelteKit's own errors (404s) are normal traffic, already in the request log.
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== 'unknown') return;
  reportUnexpected(bff().logger, error, {
    route: routeTemplate(event.route.id, event.url.pathname),
    traceId: traceIdOf(event.locals.trace)
  });
};
