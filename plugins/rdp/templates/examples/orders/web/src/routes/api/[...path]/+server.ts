// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — entry: every /api/* request, any method, goes to the ApiProxy.
// A route (not the hook) so the cookies a token renewal sets reach the browser.
import { RouteTemplate } from '#bff/RouteTemplate.ts';
import type { RequestHandler } from './$types';

export const fallback: RequestHandler = async ({ cookies, locals, request, route, url }) => {
  const reply = await locals.bff.apiProxy.forward(
    {
      method: request.method,
      pathAndQuery: url.pathname + url.search,
      route: RouteTemplate.of(route.id, url.pathname),
      contentType: request.headers.get('content-type'),
      accept: request.headers.get('accept'),
      body: request.body === null ? null : await request.arrayBuffer(),
      traceparent: locals.trace.traceparent,
      traceId: locals.trace.traceId
    },
    cookies
  );
  locals.userId = reply.userId;
  locals.upstreamMs = reply.upstreamMs;

  const headers = new Headers({ 'cache-control': 'no-store' });
  if (reply.contentType) headers.set('content-type', reply.contentType);
  return new Response(reply.body, { status: reply.status, headers });
};
