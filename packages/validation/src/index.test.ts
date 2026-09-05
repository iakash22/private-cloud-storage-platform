import { describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
  registerBodySchema,
} from './index.js';

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

  it('normalizes register emails and rejects short passwords', () => {
    const valid = registerBodySchema.safeParse({
      email: 'Owner@Example.com',
      password: 'password123',
      name: 'Owner',
      organizationName: 'Acme',
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe('owner@example.com');
    }

    const invalid = registerBodySchema.safeParse({
      email: 'owner@example.com',
      password: 'short',
      name: 'Owner',
      organizationName: 'Acme',
    });

    expect(invalid.success).toBe(false);
  });

  it('validates API error envelope with requestId', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code: 'FORBIDDEN', message: 'denied' },
      requestId: 'req-1',
    });

    expect(result.success).toBe(true);
  });
});
