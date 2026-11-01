// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the Translator port over a plain dictionary of texts.
import type { Translator } from '../../application/ports/Translator.ts';

const UNEXPECTED = 'errors.unexpected';

export class DictionaryTranslator implements Translator {
  constructor(private readonly texts: Readonly<Record<string, string>>) {}

  translate(key: string): string {
    const text = this.texts[key];
    if (text !== undefined) return text;
    // An API code we have no text for: show the generic message, never the raw code.
    if (key.startsWith('errors.')) return this.texts[UNEXPECTED] ?? UNEXPECTED;
    return key;
  }
}
