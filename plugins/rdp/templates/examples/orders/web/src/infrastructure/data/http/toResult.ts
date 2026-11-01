// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — maps an HTTP answer from the BFF to a Result. Pure, so every status is unit
// tested and only the fetch call itself is left untested.
// Error body, the same for the API and the BFF: { "error": { "code", "fields"?, "details"? } }.
import { Result, type FieldErrors } from '../../../application/Result.ts';
import { isObject } from '../../../application/isObject.ts';
import { UnexpectedResponseError } from './UnexpectedResponseError.ts';

type ApiError = {
  readonly code: string;
  readonly fields?: FieldErrors;
  readonly details?: unknown;
};

// `parse` turns the success body into the app's type (and throws UnexpectedResponseError if malformed).
export function toResult<T>(status: number, body: unknown, parse: (json: unknown) => T): Result<T> {
  if (status >= 200 && status < 300) return Result.success(parse(body));
  if (status === 400) {
    const error = readError(body);
    return Result.validation(error.code, error.fields);
  }
  if (status === 404) return Result.notFound(readError(body).code);
  if (status === 409) {
    const error = readError(body);
    return Result.conflict(error.code, error.details);
  }
  throw new UnexpectedResponseError(status); // 5xx and anything else
}

function readError(body: unknown): ApiError {
  const error = isObject(body) && isObject(body.error) ? body.error : {};
  return {
    code: typeof error.code === 'string' && error.code ? error.code : 'unexpected',
    fields: readFields(error.fields),
    details: error.details
  };
}

// Keeps only `field: code` string pairs; anything else from the wire is dropped.
function readFields(value: unknown): FieldErrors | undefined {
  if (!isObject(value)) return undefined;
  const pairs = Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string');
  return pairs.length > 0 ? Object.fromEntries(pairs) : undefined;
}
