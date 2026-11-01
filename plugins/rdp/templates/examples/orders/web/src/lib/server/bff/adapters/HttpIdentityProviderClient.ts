// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the IdentityProviderClient port over the provider's OAuth HTTP
// endpoints (`{IdentityProvider:Url}/authorize`, `/token`, `/revoke`).
import {
  IdentityProviderUnavailableError,
  type AuthorizeRequest,
  type CodeExchange,
  type IdentityProviderClient,
  type TokenResult
} from '../ports/IdentityProviderClient.ts';
import { isObject } from '../isObject.ts';

const TIMEOUT_MS = 10_000;

export class HttpIdentityProviderClient implements IdentityProviderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  authorizeUrl(request: AuthorizeRequest): string {
    const query = new URLSearchParams({
      response_type: 'code',
      redirect_uri: request.redirectUri,
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256'
    });
    return `${this.baseUrl}/authorize?${query}`;
  }

  exchangeCode(exchange: CodeExchange): Promise<TokenResult> {
    return this.requestTokens({
      grant_type: 'authorization_code',
      code: exchange.code,
      redirect_uri: exchange.redirectUri,
      code_verifier: exchange.codeVerifier
    });
  }

  refresh(refreshToken: string): Promise<TokenResult> {
    return this.requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async revoke(refreshToken: string): Promise<void> {
    const response = await this.post('/revoke', { token: refreshToken });
    // RFC 7009: the provider answers 200 even for an unknown token, so anything else is a failure.
    if (!response.ok)
      throw new IdentityProviderUnavailableError({ cause: `revoke answered ${response.status}` });
  }

  private async requestTokens(form: Record<string, string>): Promise<TokenResult> {
    const response = await this.post('/token', form);
    if (response.status >= 400 && response.status < 500) return { kind: 'rejected' };
    if (!response.ok)
      throw new IdentityProviderUnavailableError({ cause: `token answered ${response.status}` });
    return { kind: 'issued', tokens: parseTokens(await response.json()) };
  }

  private async post(path: string, form: Record<string, string>): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (error) {
      throw new IdentityProviderUnavailableError({ cause: error });
    }
  }
}

function parseTokens(json: unknown): { accessToken: string; refreshToken: string; expiresInSeconds: number } {
  const body: Readonly<Record<string, unknown>> = isObject(json) ? json : {};
  const { access_token, refresh_token, expires_in } = body;
  if (
    typeof access_token !== 'string' ||
    typeof refresh_token !== 'string' ||
    typeof expires_in !== 'number'
  ) {
    throw new IdentityProviderUnavailableError({ cause: 'token response without the expected fields' });
  }
  return { accessToken: access_token, refreshToken: refresh_token, expiresInSeconds: expires_in };
}
