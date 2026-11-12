// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// The browser's IP, as SvelteKit's adapter gives it: from the TCP connection, never from a header the browser
// can set. Behind a reverse proxy, set adapter-node's ADDRESS_HEADER and XFF_DEPTH so it reads the proxy's
// header instead. null: the adapter can't tell.
export function clientIpOf(getClientAddress: () => string): string | null {
  try {
    return getClientAddress() || null;
  } catch {
    return null;
  }
}
