import { describe, expect, it } from 'vitest';
import { createMemoryRateLimiter } from './rate-limit.js';

describe('memory rate limiter', () => {
  it('allows requests under the limit and blocks afterwards', async () => {
    let now = 1_000;
    const limiter = createMemoryRateLimiter(() => now);

    await expect(limiter.consume('login:1', 2, 60)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 60,
    });
    await expect(limiter.consume('login:1', 2, 60)).resolves.toMatchObject({ allowed: true });
    await expect(limiter.consume('login:1', 2, 60)).resolves.toMatchObject({ allowed: false });

    now += 61_000;
    await expect(limiter.consume('login:1', 2, 60)).resolves.toMatchObject({ allowed: true });
  });
});
