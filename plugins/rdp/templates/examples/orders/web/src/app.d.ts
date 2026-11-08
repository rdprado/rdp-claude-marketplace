// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// SvelteKit's app-wide types: what the BFF entry puts on `event.locals`.
import type { ApiProxy } from '#bff/api.ts';
import type { Auth } from '#bff/auth.ts';
import type { TraceContext } from '#bff/observability.ts';

declare global {
  namespace App {
    interface Locals {
      auth: Auth;
      api: ApiProxy;
      trace: TraceContext;
      // Set by the /api proxy route for the request log line.
      userId?: string | null;
      upstreamMs?: number | null;
    }
  }
}

export {};
