// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — port: one HTTP call to the API, body passed through untouched.
export type ApiRequest = {
  readonly method: string;
  // Path and query as the browser sent them, e.g. `/api/v1/orders?x=1`.
  readonly pathAndQuery: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ArrayBuffer | null;
};

export type ApiResponse = {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: ArrayBuffer;
};

export interface ApiClient {
  send(request: ApiRequest): Promise<ApiResponse>;
}

// Thrown by an adapter when the API can't be reached or times out.
export class ApiUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('API unavailable', options);
    this.name = 'ApiUnavailableError';
  }
}
