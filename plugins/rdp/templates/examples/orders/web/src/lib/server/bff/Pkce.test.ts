// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { Pkce } from './Pkce.ts';

describe('Pkce', () => {
  it('computes the S256 challenge of the RFC 7636 appendix B example', () => {
    // Act
    const challenge = Pkce.challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');

    // Assert
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('creates a different 43-character verifier each time (RFC 7636: 43 to 128)', () => {
    // Act
    const verifiers = [Pkce.createVerifier(), Pkce.createVerifier()];

    // Assert
    expect(verifiers[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifiers[0]).not.toBe(verifiers[1]);
  });
});
