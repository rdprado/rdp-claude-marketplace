// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — the outcome of a call to the API, as a discriminated union (the TS mirror of the
// .NET OutputStatus). `error` and `fields` carry the API's codes, never sentences.
// A string union, never an `enum`, even where the .NET side has one. Add a status only for a new HTTP mapping.
export type OutputStatus = 'success' | 'notFound' | 'validation' | 'conflict';

export type FieldErrors = Readonly<Record<string, string>>;

export type Result<T> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'notFound'; readonly error: string }
  | { readonly status: 'validation'; readonly error: string; readonly fields?: FieldErrors }
  | { readonly status: 'conflict'; readonly error: string; readonly details?: unknown };

export const Result = {
  success: <T>(value: T): Result<T> => ({ status: 'success', value }),
  notFound: <T>(error: string): Result<T> => ({ status: 'notFound', error }),
  validation: <T>(error: string, fields?: FieldErrors): Result<T> => ({
    status: 'validation',
    error,
    fields
  }),
  conflict: <T>(error: string, details?: unknown): Result<T> => ({ status: 'conflict', error, details })
};
