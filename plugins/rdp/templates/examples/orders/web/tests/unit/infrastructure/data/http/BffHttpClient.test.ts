// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '#application/ports/Clock.ts';
import type { Monitoring } from '#application/ports/Monitoring.ts';
import { SessionExpiredError, type Session } from '#application/ports/Session.ts';
import { BffHttpClient } from '#infrastructure/data/http/BffHttpClient.ts';

// Each call to now() moves 25 ms forward, so the recorded duration is known.
function steppingClock(): Clock {
  let ms = Date.parse('2026-10-28T12:00:00Z');
  return { now: () => new Date((ms += 25)) };
}

function setup(response: Response) {
  const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(response));
  const session = { expired: vi.fn() } satisfies Session;
  const monitoring = { report: vi.fn(), recordRequest: vi.fn() } satisfies Monitoring;
  const client = new BffHttpClient(fetchFn, session, monitoring, steppingClock());
  return { client, fetchFn, session, monitoring };
}

describe('BffHttpClient', () => {
  it('sends the body as JSON and gives back the status and the parsed body', async () => {
    // Arrange
    const { client, fetchFn } = setup(new Response('{"id":"o-1"}', { status: 201 }));

    // Act
    const reply = await client.send({
      method: 'POST',
      path: '/api/v1/orders',
      route: '/api/v1/orders',
      body: { a: 1 }
    });

    // Assert
    expect(reply).toEqual({ status: 201, body: { id: 'o-1' } });
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/orders', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{"a":1}',
      credentials: 'same-origin'
    });
  });

  it('records the request for monitoring with the route template and the duration', async () => {
    // Arrange
    const { client, monitoring } = setup(new Response('[]', { status: 200 }));

    // Act
    await client.send({ method: 'GET', path: '/api/v1/orders/o-1', route: '/api/v1/orders/:id' });

    // Assert
    expect(monitoring.recordRequest).toHaveBeenCalledWith({
      method: 'GET',
      route: '/api/v1/orders/:id',
      status: 200,
      durationMs: 25
    });
  });

  it('ends the session and throws SessionExpiredError on 401', async () => {
    // Arrange
    const { client, session } = setup(new Response('{"error":{"code":"session-expired"}}', { status: 401 }));

    // Act
    const sending = client.send({ method: 'GET', path: '/api/v1/orders', route: '/api/v1/orders' });

    // Assert
    await expect(sending).rejects.toThrow(SessionExpiredError);
    expect(session.expired).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty body', ''],
    ['a body that is not JSON', '<html>Bad gateway</html>']
  ])('gives a null body for %s', async (_, text) => {
    // Arrange
    const { client, session } = setup(new Response(text, { status: 502 }));

    // Act
    const reply = await client.send({ method: 'GET', path: '/api/v1/orders', route: '/api/v1/orders' });

    // Assert
    expect(reply).toEqual({ status: 502, body: null });
    expect(session.expired).not.toHaveBeenCalled();
  });
});
