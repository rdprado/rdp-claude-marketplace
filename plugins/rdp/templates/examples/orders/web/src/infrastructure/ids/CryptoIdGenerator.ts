// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the IdGenerator port: the browser's random UUIDs.
import type { IdGenerator } from '../../application/ports/IdGenerator.ts';

export class CryptoIdGenerator implements IdGenerator {
  newId(): string {
    return crypto.randomUUID();
  }
}
