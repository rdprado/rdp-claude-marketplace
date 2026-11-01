// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — the BFF entry (SvelteKit server hooks), and the BFF's composition root:
// the only place its classes are created, once per process.
import { json } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { ApiProxy } from '#bff/ApiProxy.ts';
import type { BffServices } from '#bff/BffServices.ts';
import { CookieSeal } from '#bff/CookieSeal.ts';
import { CsrfGuard } from '#bff/CsrfGuard.ts';
import { RequestLog } from '#bff/RequestLog.ts';
import { RouteTemplate } from '#bff/RouteTemplate.ts';
import { SessionCookie, SignInCookie } from '#bff/SessionCookie.ts';
import { SessionRefresher } from '#bff/SessionRefresher.ts';
import { SignIn } from '#bff/SignIn.ts';
import { SignOut } from '#bff/SignOut.ts';
import { TraceContext } from '#bff/TraceContext.ts';
import { FetchApiClient } from '#bff/adapters/FetchApiClient.ts';
import { HttpIdentityProviderClient } from '#bff/adapters/HttpIdentityProviderClient.ts';
import { LogMonitoring } from '#bff/adapters/LogMonitoring.ts';
import { PinoLogger } from '#bff/adapters/PinoLogger.ts';
import { SystemClock } from '#bff/adapters/SystemClock.ts';
import { readAppSettings } from './lib/server/appSettings.ts';

let services: BffServices | null = null;

// Composed when the server starts (not at import: `vite build` loads this module, and the config files are read
// only when the server runs). One instance per process: the SessionRefresher's shared state depends on it.
export const init: ServerInit = () => {
  services = composeBff();
};

function bff(): BffServices {
  services ??= composeBff();
  return services;
}

function composeBff(): BffServices {
  const config = readAppSettings();
  const clock = new SystemClock();
  const logger = new PinoLogger();
  const seal = new CookieSeal(config.sessionSecret);
  const sessionCookie = new SessionCookie(seal);
  const identityProvider = new HttpIdentityProviderClient(config.idpUrl);
  const sessions = new SessionRefresher(identityProvider, sessionCookie, clock, logger);
  const api = new FetchApiClient(config.apiUrl);
  return {
    clock,
    logger,
    monitoring: new LogMonitoring(logger),
    csrfGuard: new CsrfGuard(logger),
    signIn: new SignIn(
      identityProvider,
      sessionCookie,
      new SignInCookie(seal),
      clock,
      logger,
      config.authRedirectUri
    ),
    signOut: new SignOut(identityProvider, sessionCookie, logger),
    apiProxy: new ApiProxy(sessions, api, clock, logger)
  };
}

// Every request: trace context, CSRF check, then the route, then one log line.
export const handle: Handle = async ({ event, resolve }) => {
  const { clock, csrfGuard, logger } = bff();
  const started = clock.now().getTime();
  const trace = TraceContext.fromHeader(event.request.headers.get('traceparent'));
  const route = RouteTemplate.of(event.route.id, event.url.pathname);
  event.locals.bff = bff();
  event.locals.trace = trace;

  // `event.url.origin` is the public origin: behind a reverse proxy, set adapter-node's ORIGIN.
  const refusal = csrfGuard.check(
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
    RequestLog.fields({
      method: event.request.method,
      route,
      status: response.status,
      startedMs: started,
      endedMs: clock.now().getTime(),
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
  bff().monitoring.report(error, {
    route: RouteTemplate.of(event.route.id, event.url.pathname),
    traceId: RequestLog.traceIdOf(event.locals.trace)
  });
};
