// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: turns an i18n key into the user's language. ViewModels hold keys; the
// View translates them.
export interface Translator {
  // An `errors.*` key with no text gives the text of `errors.unexpected`: never a raw code.
  translate(key: string): string;
}
