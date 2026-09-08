import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import { Redis } from 'ioredis';
import type { DependencyCheck } from '@vaultstack/types';

export interface DependencyClients {
  redis: Redis;
  prisma: PrismaClient;
}

export function createRedisClient(config: EnvConfig): Redis {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  // ioredis emits 'error' while reconnecting. Without a listener Node prints
  // "Unhandled error event" even though checkRedis and the rate limiter catch
  // the same failures. Readiness still reports redis as error.
  redis.on('error', () => undefined);
  return redis;
}

export async function checkPostgres(prisma: PrismaClient): Promise<DependencyCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'postgresql', status: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { name: 'postgresql', status: 'error', message };
  }
}

export async function checkRedis(redis: Redis): Promise<DependencyCheck> {
  try {
    if (redis.status !== 'ready') {
      await redis.connect();
    }
    await redis.ping();
    return { name: 'redis', status: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { name: 'redis', status: 'error', message };
  }
}

export async function shutdownDependencyClients(clients: DependencyClients): Promise<void> {
  await Promise.allSettled([clients.redis.quit(), clients.prisma.$disconnect()]);
}
