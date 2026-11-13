// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { toResult } from '#infrastructure/data/http/toResult.ts';
import { UnexpectedResponseError } from '#infrastructure/data/http/UnexpectedResponseError.ts';

const asIs = (json: unknown) => json;

describe('toResult', () => {
  it.each([[200], [201], [299]])('maps %i to success with the parsed body', (status) => {
    // Act
    const result = toResult(status, { id: 'o-1' }, asIs);

    // Assert
    expect(result).toEqual({ status: 'success', value: { id: 'o-1' } });
  });

  it('maps 400 to validation with the code and each field code', () => {
    // Arrange
    const body = {
      error: { code: 'validation-failed', fields: { symbol: 'invalid', price: 'must-be-positive' } }
    };

    // Act
    const result = toResult(400, body, asIs);

    // Assert
    expect(result).toEqual({
      status: 'validation',
      error: 'validation-failed',
      fields: { symbol: 'invalid', price: 'must-be-positive' }
    });
  });

  it('maps 400 without fields to validation without fields', () => {
    // Act
    const result = toResult(400, { error: { code: 'validation-failed' } }, asIs);

    // Assert
    expect(result).toEqual({ status: 'validation', error: 'validation-failed', fields: undefined });
  });

  it.each([
    [404, { error: { code: 'not-found' } }, { status: 'notFound', error: 'not-found' }],
    [
      409,
      { error: { code: 'client-order-id-reused' } },
      { status: 'conflict', error: 'client-order-id-reused', details: undefined }
    ]
  ])('maps %i to its status with the code', (status, body, expected) => {
    // Act
    const result = toResult(status, body, asIs);

    // Assert
    expect(result).toEqual(expected);
  });

  it.each([[null], ['<html>bad gateway</html>'], [{ error: { code: '' } }]])(
    'uses the code unexpected when the error body is %j',
    (body) => {
      // Act
      const result = toResult(404, body, asIs);

      // Assert
      expect(result).toEqual({ status: 'notFound', error: 'unexpected' });
    }
  );

  it.each([[500], [502], [503], [300], [302], [403]])('throws on %i', (status) => {
    // Act / Assert
    expect(() => toResult(status, { error: { code: 'unexpected' } }, asIs)).toThrow(UnexpectedResponseError);
  });

  it('drops field codes that are not strings', () => {
    // Act
    const result = toResult(
      400,
      { error: { code: 'validation-failed', fields: { symbol: 'required', x: 3 } } },
      asIs
    );

    // Assert
    expect(result.status === 'validation' && result.fields).toEqual({ symbol: 'required' });
  });

  it('gives no fields when none of them is a string', () => {
    // Act
    const result = toResult(400, { error: { code: 'validation-failed', fields: { x: 3 } } }, asIs);

    // Assert
    expect(result).toEqual({ status: 'validation', error: 'validation-failed', fields: undefined });
  });
});
