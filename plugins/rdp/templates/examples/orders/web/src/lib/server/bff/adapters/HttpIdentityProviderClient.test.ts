// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { IdentityProviderUnavailableError } from '../ports/IdentityProviderClient.ts';
import { HttpIdentityProviderClient } from './HttpIdentityProviderClient.ts';

const TOKENS = { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 300 };

// The provider's /token endpoint answering `body` with `status`.
function providerAnswering(body: unknown, status = 200): HttpIdentityProviderClient {
  const fetchFn = () => Promise.resolve(Response.json(body, { status }));
  return new HttpIdentityProviderClient('http://idp.test', fetchFn);
}

describe('HttpIdentityProviderClient', () => {
  it('reads the tokens the provider issued', async () => {
    // Act
    const result = await providerAnswering(TOKENS).refresh('refresh-0');

    // Assert
    expect(result).toEqual({
      kind: 'issued',
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1', expiresInSeconds: 300 }
    });
  });

  it.each([[400], [499]])('treats %i as the provider rejecting the token', async (status) => {
    // Act
    const result = await providerAnswering({ error: 'invalid_grant' }, status).refresh('refresh-0');

    // Assert
    expect(result).toEqual({ kind: 'rejected' });
  });

  it.each([[500], [503]])('treats %i as the provider being down', async (status) => {
    // Act / Assert
    await expect(providerAnswering({}, status).refresh('refresh-0')).rejects.toThrow(
      IdentityProviderUnavailableError
    );
  });

  it.each([
    ['access_token', { ...TOKENS, access_token: undefined }],
    ['refresh_token', { ...TOKENS, refresh_token: undefined }],
    ['expires_in', { ...TOKENS, expires_in: '300' }]
  ])('treats a token answer without a valid %s as the provider failing', async (_, body) => {
    // Act / Assert
    await expect(providerAnswering(body).refresh('refresh-0')).rejects.toThrow(
      IdentityProviderUnavailableError
    );
  });
});
