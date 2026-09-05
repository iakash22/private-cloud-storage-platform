import { loadEnv } from '@vaultstack/config';
import { createPrismaClient } from '@vaultstack/database';
import { createLogger } from '@vaultstack/logger';
import { createApp } from './app.js';
import { createRedisClient, shutdownDependencyClients } from './lib/dependencies.js';

const config = loadEnv();
const logger = createLogger({ name: 'api', level: config.LOG_LEVEL });
const prisma = createPrismaClient(config.DATABASE_URL);
const redis = createRedisClient(config);
const app = createApp({
  config,
  logger,
  prisma,
  clients: { redis, prisma },
});

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  logger.info({ host: config.API_HOST, port: config.API_PORT }, 'VaultStack API listening');
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
