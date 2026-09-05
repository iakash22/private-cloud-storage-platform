export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}

export function createMemoryRateLimiter(now: () => number = () => Date.now()): RateLimiter {
  const buckets = new Map<string, MemoryBucket>();

  return {
    // In-memory counting needs no I/O, but the signature stays promise-based so
    // it remains interchangeable with the Redis limiter.
    consume(key, limit, windowSeconds) {
      const current = now();
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= current) {
        buckets.set(key, { count: 1, resetAt: current + windowSeconds * 1000 });
        return Promise.resolve({ allowed: true, retryAfterSeconds: windowSeconds });
      }

      existing.count += 1;
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - current) / 1000));

      return Promise.resolve({
        allowed: existing.count <= limit,
        retryAfterSeconds,
      });
    },
  };
}

export interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
}

export function createRedisRateLimiter(redis: RedisLike): RateLimiter {
  return {
    async consume(key, limit, windowSeconds) {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttlMs = await redis.pttl(key);
      const retryAfterSeconds = ttlMs > 0 ? Math.max(1, Math.ceil(ttlMs / 1000)) : windowSeconds;

      return {
        allowed: count <= limit,
        retryAfterSeconds,
      };
    },
  };
}
