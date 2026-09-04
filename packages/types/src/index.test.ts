import { describe, expect, it } from 'vitest';
import type { HealthResponse } from './index.js';

describe('@vaultstack/types', () => {
  it('exports health response shape', () => {
    const health: HealthResponse = {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime: 0,
    };

    expect(health.status).toBe('ok');
  });
});
