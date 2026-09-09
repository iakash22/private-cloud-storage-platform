import express, { type Express } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import { createCorsMiddleware } from './middleware/cors.js';
import { createErrorHandler, createNotFoundHandler } from './middleware/error-handler.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createRedisClient, type DependencyClients } from './lib/dependencies.js';
import type { AppContainer } from './container/app-container.js';
import {
  createHttpMetricsMiddleware,
  createMetricsHandler,
  createMetricsRegistry,
  type MetricsRegistry,
} from './observability/metrics.js';
import type { StorageMetrics } from './modules/storage/services/storage.metrics.js';
import {
  createMemoryRateLimiter,
  createRedisRateLimiter,
  type RateLimiter,
} from './lib/rate-limit.js';
import { getHealthHandler, getReadyHandler } from './routes/health.js';
import { createOpenApiRouter } from './routes/openapi.js';
import { createV1Router } from './routes/v1.js';

export interface CreateAppOptions {
  config: EnvConfig;
  logger: Logger;
  prisma: PrismaClient;
  clients?: DependencyClients;
  rateLimiter?: RateLimiter;
  metrics?: MetricsRegistry;
  storageMetrics?: StorageMetrics;
  container?: AppContainer;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const redis = options.clients?.redis ?? createRedisClient(options.config);
  const metrics = options.metrics ?? createMetricsRegistry();
  const clients: DependencyClients = {
    redis,
    prisma: options.prisma,
  };
  const startedAt = Date.now();
  const rateLimiter =
    options.rateLimiter ??
    (options.config.NODE_ENV === 'test'
      ? createMemoryRateLimiter()
      : createRedisRateLimiter(redis));

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(createHttpMetricsMiddleware(metrics));
  app.use(createCorsMiddleware(options.config));

  // Object bytes must reach the storage provider as a stream. The JSON parser
  // is skipped for byte-transfer routes so it cannot consume the request body
  // (it would otherwise buffer any upload sent as application/json).
  const jsonParser = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    if (isRawBodyRoute(req.path)) {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

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
  if (options.metrics && options.storageMetrics) {
    app.get(
      '/metrics',
      createMetricsHandler({
        registry: metrics,
        config: options.config,
        prisma: options.prisma,
        redis,
        storageMetrics: options.storageMetrics,
      }),
    );
  } else {
    app.get('/metrics', (_req, res) => {
      res.status(404).end();
    });
  }

  app.use('/api', createOpenApiRouter());

  app.use(
    '/api/v1',
    createV1Router(options.prisma, options.config, rateLimiter, options.logger, options.container),
  );

  app.use(createNotFoundHandler());
  app.use(createErrorHandler(options.logger));

  return app;
}

const RAW_BODY_PATTERNS = [
  /^\/api\/v1\/storage\/uploads\/[^/]+\/content$/,
  /^\/api\/v1\/storage\/multipart-uploads\/[^/]+\/parts$/,
  /^\/api\/v1\/s3(\/|$)/,
];

function isRawBodyRoute(path: string): boolean {
  return RAW_BODY_PATTERNS.some((pattern) => pattern.test(path));
}
