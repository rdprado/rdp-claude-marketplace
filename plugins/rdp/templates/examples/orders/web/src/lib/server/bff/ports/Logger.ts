// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: structured logging (one event name + fields). Never pass tokens, cookies,
// sign-in codes, emails or bodies in the fields.
export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}
