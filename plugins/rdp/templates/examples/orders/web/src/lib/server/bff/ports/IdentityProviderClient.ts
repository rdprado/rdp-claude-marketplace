// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: the identity provider's OAuth endpoints (authorization code + PKCE,
// refresh with rotation, revoke).
export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
};

// `rejected` is the provider's `invalid_grant` (bad, expired, revoked or reused code/token).
export type TokenResult =
  { readonly kind: 'issued'; readonly tokens: TokenSet } | { readonly kind: 'rejected' };

export type AuthorizeRequest = {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
};

export type CodeExchange = {
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
};

export interface IdentityProviderClient {
  authorizeUrl(request: AuthorizeRequest): string;
  exchangeCode(exchange: CodeExchange): Promise<TokenResult>;
  refresh(refreshToken: string): Promise<TokenResult>;
  revoke(refreshToken: string): Promise<void>;
}

// Thrown by an adapter when the provider can't be reached or answers 5xx: not the user's fault.
export class IdentityProviderUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Identity provider unavailable', options);
    this.name = 'IdentityProviderUnavailableError';
  }
}
