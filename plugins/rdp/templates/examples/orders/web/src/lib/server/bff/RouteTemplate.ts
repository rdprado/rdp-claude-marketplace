// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — the route to log: a template, never the real path (paths can carry ids, emails).
const ID_SEGMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

export const RouteTemplate = {
  // SvelteKit's route id for its own routes; for the API catch-all, the path with ids replaced.
  of(routeId: string | null, pathname: string): string {
    if (routeId === null) return 'unmatched';
    if (!routeId.includes('[...')) return routeId;
    return pathname.split('/').map(templateSegment).join('/');
  }
};

function templateSegment(segment: string): string {
  if (ID_SEGMENT.test(segment)) return ':id';
  if (segment.includes('@') || segment.includes('%40')) return ':email';
  return segment;
}
