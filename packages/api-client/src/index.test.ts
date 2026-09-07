import { describe, expect, it, vi } from 'vitest';
import { VaultStackApiClient } from './client.js';

describe('@vaultstack/api-client', () => {
  it('fetches health status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: 'ok',
          service: 'api',
          timestamp: new Date().toISOString(),
          uptime: 1,
        }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });

    const health = await client.getHealth();

    expect(health.status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/health', expect.any(Object));
  });
});
