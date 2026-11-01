// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestRecord } from '../../application/ports/Monitoring.ts';
import { ConsoleMonitoring } from './ConsoleMonitoring.ts';

function request(n: number): RequestRecord {
  return { method: 'GET', route: '/api/v1/orders/:id', status: 200, durationMs: n };
}

describe('ConsoleMonitoring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports an error with the last 20 requests, oldest first', () => {
    // Arrange
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const monitoring = new ConsoleMonitoring();
    for (let n = 1; n <= 22; n++) monitoring.recordRequest(request(n));
    const failure = new Error('boom');

    // Act
    monitoring.report(failure);

    // Assert
    const recent = Array.from({ length: 20 }, (_, i) => request(i + 3));
    expect(error).toHaveBeenCalledWith('Unexpected error', failure, { recentRequests: recent });
  });
});
