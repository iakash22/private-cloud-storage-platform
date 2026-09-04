import type { EnvConfig } from '@vaultstack/config';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Redis } from 'ioredis';
import pg from 'pg';
import type { DependencyCheck } from '@vaultstack/types';

export interface DependencyClients {
  redis: Redis;
  pgPool: pg.Pool;
  s3: S3Client;
}

export function createDependencyClients(config: EnvConfig): DependencyClients {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  const pgPool = new pg.Pool({
    connectionString: config.DATABASE_URL,
  });

  const protocol = config.MINIO_USE_SSL ? 'https' : 'http';
  const s3 = new S3Client({
    region: 'us-east-1',
    endpoint: `${protocol}://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}`,
    credentials: {
      accessKeyId: config.MINIO_ACCESS_KEY,
      secretAccessKey: config.MINIO_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  return { redis, pgPool, s3 };
}

export async function checkPostgres(pool: pg.Pool): Promise<DependencyCheck> {
  try {
    await pool.query('SELECT 1');
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

export async function checkMinio(s3: S3Client, bucket: string): Promise<DependencyCheck> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return { name: 'minio', status: 'ok' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { name: 'minio', status: 'error', message };
  }
}

export async function shutdownDependencyClients(clients: DependencyClients): Promise<void> {
  await Promise.allSettled([clients.redis.quit(), clients.pgPool.end()]);
  clients.s3.destroy();
}
