// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Narrow integration test of the front's infrastructure: HttpOrdersGateway + BffHttpClient, with Node's
// fetch, against a fake BFF on localhost. Checks what goes over HTTP and how the answers are read.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '#application/ports/Clock.ts';
import type { Monitoring } from '#application/ports/Monitoring.ts';
import { SessionExpiredError, type Session } from '#application/ports/Session.ts';
import { Result } from '#application/Result.ts';
import { BffHttpClient } from '#infrastructure/data/http/BffHttpClient.ts';
import { UnexpectedResponseError } from '#infrastructure/data/http/UnexpectedResponseError.ts';
import { HttpOrdersGateway } from '#infrastructure/data/orders/HttpOrdersGateway.ts';
import { startFakeHttpServer, type FakeHttpServer } from '../../support/fakeHttpServer.ts';

const ORDER_JSON = {
  id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  symbol: 'PETR4',
  side: 'sell',
  quantity: 100,
  price: 37.45,
  createdAt: '2026-10-28T12:00:00Z'
};
const ORDER = { ...ORDER_JSON, createdAt: new Date('2026-10-28T12:00:00Z') };
const NEW_ORDER = {
  clientOrderId: 'c-1',
  symbol: 'PETR4',
  side: 'sell',
  quantity: 100,
  price: 37.45
} as const;
const fixedClock: Clock = { now: () => new Date('2026-10-28T12:00:00Z') };

let bff: FakeHttpServer;

beforeAll(async () => {
  bff = await startFakeHttpServer();
});

afterAll(() => bff.close());

beforeEach(() => {
  bff.requests.length = 0;
});

function setup() {
  // The browser resolves the gateway's same-origin paths (/api/...) against the page; here, the fake BFF.
  const sameOriginFetch: typeof fetch = (path, init) => fetch(`${bff.url}${String(path)}`, init);
  const session = { expired: vi.fn() } satisfies Session;
  const monitoring = { report: vi.fn(), recordRequest: vi.fn() } satisfies Monitoring;
  const gateway = new HttpOrdersGateway(new BffHttpClient(sameOriginFetch, session, monitoring, fixedClock));
  return { gateway, session };
}

describe('HttpOrdersGateway against a fake BFF', () => {
  it('lists the orders with GET /api/v1/orders and maps them', async () => {
    // Arrange
    bff.answerWith(() => ({ status: 200, body: [ORDER_JSON] }));
    const { gateway } = setup();

    // Act
    const result = await gateway.list();

    // Assert
    expect(result).toEqual(Result.success([ORDER]));
    expect(bff.requests).toHaveLength(1);
    expect(bff.requests[0]).toMatchObject({ method: 'GET', path: '/api/v1/orders', body: '' });
    expect(bff.requests[0]?.headers.accept).toBe('application/json');
  });

  it('creates an order with POST and a JSON body', async () => {
    // Arrange
    bff.answerWith(() => ({ status: 201, body: ORDER_JSON }));
    const { gateway } = setup();

    // Act
    const result = await gateway.create(NEW_ORDER);

    // Assert
    expect(result).toEqual(Result.success(ORDER));
    expect(bff.requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/orders' });
    expect(bff.requests[0]?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(bff.requests[0]?.body ?? '')).toEqual(NEW_ORDER);
  });

  it('reads the API error shape into a conflict', async () => {
    // Arrange
    bff.answerWith(() => ({ status: 409, body: { error: { code: 'client-order-id-reused' } } }));
    const { gateway } = setup();

    // Act
    const result = await gateway.create(NEW_ORDER);

    // Assert
    expect(result).toEqual(Result.conflict('client-order-id-reused', undefined));
  });

  it('turns a 401 into session expired', async () => {
    // Arrange
    bff.answerWith(() => ({ status: 401, body: { error: { code: 'session-expired' } } }));
    const { gateway, session } = setup();

    // Act
    const listing = gateway.list();

    // Assert
    await expect(listing).rejects.toBeInstanceOf(SessionExpiredError);
    expect(session.expired).toHaveBeenCalledOnce();
  });

  it('throws on a 5xx', async () => {
    // Arrange
    bff.answerWith(() => ({ status: 502, body: { error: { code: 'api-unavailable' } } }));
    const { gateway } = setup();

    // Act
    const listing = gateway.list();

    // Assert
    await expect(listing).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
