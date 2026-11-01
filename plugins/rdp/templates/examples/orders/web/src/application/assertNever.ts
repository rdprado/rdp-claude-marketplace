// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — closes every `switch` on a status: a new case that isn't handled breaks the build.
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
