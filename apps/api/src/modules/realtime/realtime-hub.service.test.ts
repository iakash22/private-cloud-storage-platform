import { describe, expect, it } from 'vitest';
import { realtimeEventSchema } from '@vaultstack/validation';

describe('realtimeEventSchema', () => {
  it('accepts a session revoked payload', () => {
    const parsed = realtimeEventSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'session.revoked',
      organizationId: '550e8400-e29b-41d4-a716-446655440001',
      userId: '550e8400-e29b-41d4-a716-446655440002',
      createdAt: new Date().toISOString(),
      payload: { sessionId: '550e8400-e29b-41d4-a716-446655440003', revokedBySelf: false },
    });

    expect(parsed.success).toBe(true);
  });
});
