// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: the request's cookies. SvelteKit's `event.cookies` satisfies it as is.
export type CookieOptions = {
  readonly path: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'lax' | 'strict';
  readonly maxAge?: number;
};

export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  delete(name: string, options: { readonly path: string }): void;
}
