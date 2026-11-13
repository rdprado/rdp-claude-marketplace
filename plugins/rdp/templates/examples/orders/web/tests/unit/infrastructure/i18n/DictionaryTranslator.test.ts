// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { DictionaryTranslator } from '#infrastructure/i18n/DictionaryTranslator.ts';

const texts = { 'orders.empty': 'Nenhuma ordem.', 'errors.unexpected': 'Algo deu errado.' };

describe('DictionaryTranslator', () => {
  it.each([
    ['a known key', 'orders.empty', 'Nenhuma ordem.'],
    ['an error code with no text', 'errors.brand-new-code', 'Algo deu errado.'],
    ['another unknown key', 'orders.missing', 'orders.missing']
  ])('translates %s', (_, key, expected) => {
    // Act
    const text = new DictionaryTranslator(texts).translate(key);

    // Assert
    expect(text).toBe(expected);
  });

  it('shows the generic error text as it is, even when it is empty', () => {
    // Act
    const text = new DictionaryTranslator({ 'errors.unexpected': '' }).translate('errors.brand-new-code');

    // Assert
    expect(text).toBe('');
  });

  it('shows the generic error key when the dictionary has no text for it', () => {
    // Act
    const text = new DictionaryTranslator({}).translate('errors.brand-new-code');

    // Assert
    expect(text).toBe('errors.unexpected');
  });

  it('every error code of the API contract has a Portuguese text', async () => {
    // Arrange: the codes the API sends (its ErrorCodes), plus the BFF's own.
    const { ptBR } = await import('#infrastructure/i18n/ptBR.ts');
    const codes = [
      'unexpected',
      'validation-failed',
      'client-order-id-reused',
      'required',
      'invalid',
      'must-be-positive',
      'api-unavailable',
      'identity-provider-unavailable'
    ];

    // Act
    const missing = codes.filter((code) => ptBR[`errors.${code}`] === undefined);

    // Assert
    expect(missing).toEqual([]);
  });
});
