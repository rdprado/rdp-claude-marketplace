// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Infrastructure — adapter of the ApiClient port over fetch, against `Api:Url`.
import {
  ApiUnavailableError,
  type ApiClient,
  type ApiRequest,
  type ApiResponse
} from '../ports/ApiClient.ts';

const TIMEOUT_MS = 15_000;

export class FetchApiClient implements ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async send(request: ApiRequest): Promise<ApiResponse> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}${request.pathAndQuery}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.arrayBuffer()
      };
    } catch (error) {
      throw new ApiUnavailableError({ cause: error });
    }
  }
}
