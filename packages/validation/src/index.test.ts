import { describe, expect, it } from 'vitest';
import { healthResponseSchema, readinessResponseSchema } from './index.js';

describe('@vaultstack/validation', () => {
  it('validates health response', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime: 1,
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid readiness response', () => {
    const result = readinessResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      timestamp: 'not-a-date',
      checks: [],
    });

    expect(result.success).toBe(false);
  });
});
