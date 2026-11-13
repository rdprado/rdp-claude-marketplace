// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Tests only: a fake HTTP server on localhost for narrow integration tests. It stands in for the other side
// (the BFF, the identity provider, the API): it records each request and answers what the test says.
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export type ReceivedRequest = {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
};

export type FakeAnswer = { readonly status: number; readonly body?: unknown };

export type FakeHttpServer = {
  // e.g. `http://127.0.0.1:53211`
  readonly url: string;
  readonly requests: ReceivedRequest[];
  answerWith(answer: (request: ReceivedRequest) => FakeAnswer): void;
  close(): Promise<void>;
};

export async function startFakeHttpServer(): Promise<FakeHttpServer> {
  const requests: ReceivedRequest[] = [];
  let answer: (request: ReceivedRequest) => FakeAnswer = () => ({ status: 404 });

  const server = createServer(async (incoming, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);
    const request = {
      method: incoming.method ?? '',
      path: incoming.url ?? '/',
      headers: incoming.headers,
      body: Buffer.concat(chunks).toString()
    };
    requests.push(request);
    const { status, body } = answer(request);
    if (body === undefined) {
      response.writeHead(status).end();
      return;
    }
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    answerWith: (next) => {
      answer = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
