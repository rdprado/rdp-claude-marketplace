// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — BFF use case: refuses mutating requests that don't come from the app's own
// origin. The session cookie goes with every request the browser makes, so this is what stops another
// site from posting with it.
import type { Logger } from './ports/Logger.ts';

export type IncomingRequest = {
  readonly method: string;
  readonly route: string;
  readonly origin: string | null;
  readonly secFetchSite: string | null;
  readonly appOrigin: string;
};

// The refusal the entry sends back, in the API's error shape.
export type CsrfRefusal = {
  readonly status: 403;
  readonly body: { readonly error: { readonly code: 'csrf-rejected' } };
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfGuardUseCase {
  // null: let the request through; otherwise the refusal to send instead.
  check(request: IncomingRequest, traceId: string): CsrfRefusal | null;
}

export class CsrfGuard implements CsrfGuardUseCase {
  constructor(private readonly logger: Logger) {}

  check(request: IncomingRequest, traceId: string): CsrfRefusal | null {
    if (SAFE_METHODS.has(request.method.toUpperCase())) return null;
    if (isSameOrigin(request)) return null;

    this.logger.warn('csrf.rejected', { method: request.method, route: request.route, traceId });
    return { status: 403, body: { error: { code: 'csrf-rejected' } } };
  }
}

// Browsers send Origin on every cross-origin or non-GET fetch; Sec-Fetch-Site covers the rare request
// without it. Neither header can be set by page JavaScript.
function isSameOrigin(request: IncomingRequest): boolean {
  if (request.origin !== null) return request.origin === request.appOrigin;
  return request.secFetchSite === 'same-origin';
}
