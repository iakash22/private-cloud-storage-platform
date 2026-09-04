import express, { type Express } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { Logger } from '@vaultstack/logger';
import {
  createDependencyClients,
  type DependencyClients,
} from './lib/dependencies.js';
import { createErrorHandler, createNotFoundHandler } from './middleware/error-handler.js';
import { getHealthHandler, getReadyHandler } from './routes/health.js';

export interface CreateAppOptions {
  config: EnvConfig;
  logger: Logger;
  clients?: DependencyClients;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const clients = options.clients ?? createDependencyClients(options.config);
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', getHealthHandler({ serviceName: 'api', startedAt }));
  app.get(
    '/ready',
    getReadyHandler({
      serviceName: 'api',
      startedAt,
      config: options.config,
      clients,
    }),
  );

  app.use(createNotFoundHandler());
  app.use(createErrorHandler(options.logger));

  return app;
}
