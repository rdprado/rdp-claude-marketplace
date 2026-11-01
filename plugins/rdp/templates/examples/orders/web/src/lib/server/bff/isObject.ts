// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — narrows outside data (JSON, a cookie, a token) to an object whose fields can be read
// and checked one by one: a type guard instead of `as Record<string, unknown>`.
export function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
