// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: unexpected errors, with their stack, to the project's monitoring tool.
export interface Monitoring {
  report(error: unknown, context?: Readonly<Record<string, string>>): void;
}
