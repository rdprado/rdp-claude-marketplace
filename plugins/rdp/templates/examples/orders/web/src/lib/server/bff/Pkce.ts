// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — PKCE (RFC 7636, S256) and the OAuth `state`: random values from the platform's
// cryptographic generator, never Math.random.
import { createHash, randomBytes } from 'node:crypto';

export const Pkce = {
  createVerifier(): string {
    return randomBytes(32).toString('base64url');
  },

  createState(): string {
    return randomBytes(16).toString('base64url');
  },

  // S256: BASE64URL(SHA256(verifier)).
  challengeOf(verifier: string): string {
    return createHash('sha256').update(verifier, 'ascii').digest('base64url');
  }
};
