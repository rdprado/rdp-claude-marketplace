// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port to the project's monitoring tool (not chosen yet at RDP; e.g. Sentry).
export type RequestRecord = {
  readonly method: string;
  // The route template (`/api/v1/orders/:id`), never the real path.
  readonly route: string;
  readonly status: number;
  readonly durationMs: number;
};

export interface Monitoring {
  // Unexpected failures only (network, 5xx): never validation, not-found or an expired session.
  report(error: unknown): void;
  // Context that travels with a later report (a "breadcrumb"); not an alert by itself.
  recordRequest(request: RequestRecord): void;
}
