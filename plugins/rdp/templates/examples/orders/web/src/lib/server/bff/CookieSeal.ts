// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — seals the BFF's cookie values with AES-256-GCM, so the browser (DevTools,
// extensions, a copied cookie file) sees only ciphertext and any change to it is detected.
// The key is derived from Session:Secret; changing the secret signs everybody out.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const IV_BYTES = 12; // the GCM standard nonce size; random per seal
const TAG_BYTES = 16;

export class CookieSeal {
  private readonly key: Buffer;

  // `secret` is Session:Secret, already checked (length) by src/lib/server/appSettings.ts.
  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync('sha256', secret, '', 'bff-cookie-seal', 32));
  }

  // `name` is bound as additional data: a value sealed for one cookie doesn't open as another.
  seal(name: string, value: object): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv).setAAD(Buffer.from(name, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  // The cookie comes from the browser: anything tampered, truncated or sealed with another key is null.
  open(name: string, raw: string | undefined): unknown {
    if (!raw) return null;
    const bytes = Buffer.from(raw, 'base64url');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, IV_BYTES))
        .setAAD(Buffer.from(name, 'utf8'))
        .setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const plain = Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
      return JSON.parse(plain.toString('utf8'));
    } catch {
      return null;
    }
  }
}
