import { loadEnv } from '@vaultstack/config';
import { createPrismaClient } from '@vaultstack/database';
import { createLogger } from '@vaultstack/logger';
import { printStartupBanner } from '@vaultstack/startup';
import { createApp } from './app.js';
import { createMetricsRegistry } from './observability/metrics.js';
import { createAppContainer } from './container/app-container.js';
import {
  checkPostgres,
  checkRedis,
  createRedisClient,
  shutdownDependencyClients,
} from './lib/dependencies.js';

const config = loadEnv();
const logger = createLogger({ name: 'api', level: config.LOG_LEVEL });
const prisma = createPrismaClient(config.DATABASE_URL);
const redis = createRedisClient(config);
const metrics = createMetricsRegistry();
const container = createAppContainer(prisma, config, logger, metrics);
const app = createApp({
  config,
  logger,
  prisma,
  clients: { redis, prisma },
  metrics,
  storageMetrics: container.storage.metrics,
  container,
});

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  logger.info({ host: config.API_HOST, port: config.API_PORT }, 'VaultStack API listening');
  void printStartupBanner({
    serverName: 'VaultStack',
    environment: config.NODE_ENV,
    apiHost: config.API_HOST,
    apiPort: config.API_PORT,
    databaseUrl: config.DATABASE_URL,
    redisUrl: config.REDIS_URL,
    minioEndpoint: config.MINIO_ENDPOINT,
    minioPort: config.MINIO_PORT,
    dashboardPort: 5173,
    checkDatabase: async () => {
      const result = await checkPostgres(prisma);
      return { ok: result.status === 'ok', message: result.message };
    },
    checkRedis: async () => {
      const result = await checkRedis(redis);
      return { ok: result.status === 'ok', message: result.message };
    },
  });
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down API');
  server.close();
  await shutdownDependencyClients({ redis, prisma });
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

export { app, server };
