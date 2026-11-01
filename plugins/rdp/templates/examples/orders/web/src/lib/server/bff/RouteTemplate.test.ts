// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { describe, expect, it } from 'vitest';
import { RouteTemplate } from './RouteTemplate.ts';

describe('RouteTemplate', () => {
  it.each([
    ['/auth/callback', '/auth/callback', '/auth/callback'],
    [null, '/whatever/joe@example.com', 'unmatched'],
    ['/api/[...path]', '/api/v1/orders', '/api/v1/orders'],
    [
      '/api/[...path]',
      '/api/v1/orders/3f2504e0-4f89-11d3-9a0c-0305e82c3301/cancel',
      '/api/v1/orders/:id/cancel'
    ],
    ['/api/[...path]', '/api/v1/orders/42', '/api/v1/orders/:id'],
    ['/api/[...path]', '/api/v1/trainees/joe%40example.com', '/api/v1/trainees/:email']
  ])('logs route %s with path %s as %s', (routeId, pathname, expected) => {
    // Act
    const route = RouteTemplate.of(routeId, pathname);

    // Assert
    expect(route).toBe(expected);
  });
});
