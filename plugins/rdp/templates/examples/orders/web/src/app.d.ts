// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — SvelteKit's app-wide types: what the BFF entry puts on `event.locals`.
import type { BffServices } from '#bff/BffServices.ts';
import type { TraceContext } from '#bff/TraceContext.ts';

declare global {
  namespace App {
    interface Locals {
      bff: BffServices;
      trace: TraceContext;
      // Set by the /api proxy route for the request log line.
      userId?: string | null;
      upstreamMs?: number | null;
    }
  }
}

export {};
