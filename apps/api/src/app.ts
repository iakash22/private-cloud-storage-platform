import express, { type Express } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import { createErrorHandler, createNotFoundHandler } from './middleware/error-handler.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createRedisClient, type DependencyClients } from './lib/dependencies.js';
import { getHealthHandler, getReadyHandler } from './routes/health.js';
import { createV1Router } from './routes/v1.js';

export interface CreateAppOptions {
  config: EnvConfig;
  logger: Logger;
  prisma: PrismaClient;
  clients?: DependencyClients;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const redis = options.clients?.redis ?? createRedisClient(options.config);
  const clients: DependencyClients = {
    redis,
    prisma: options.prisma,
  };
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(createRequestLogger(options.logger));

  const healthHandler = getHealthHandler({ serviceName: 'api', startedAt });
  const readyHandler = getReadyHandler({
    serviceName: 'api',
    startedAt,
    clients,
  });

  app.get('/health', healthHandler);
  app.get('/ready', readyHandler);
  app.get('/api/v1/health', healthHandler);
  app.get('/api/v1/ready', readyHandler);

  app.use('/api/v1', createV1Router(options.prisma, options.config));

  app.use(createNotFoundHandler());
  app.use(createErrorHandler(options.logger));

  return app;
}
