import type { Request, Response } from 'express';
import type { HealthResponse, ReadinessResponse } from '@vaultstack/types';
import { healthResponseSchema, readinessResponseSchema } from '@vaultstack/validation';
import type { DependencyClients } from '../lib/dependencies.js';
import { checkPostgres, checkRedis } from '../lib/dependencies.js';

export interface HealthRouterDeps {
  serviceName: string;
  startedAt: number;
  clients: DependencyClients;
}

export function getHealthHandler(deps: Pick<HealthRouterDeps, 'serviceName' | 'startedAt'>) {
  return (_req: Request, res: Response): void => {
    const payload: HealthResponse = {
      status: 'ok',
      service: deps.serviceName,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    healthResponseSchema.parse(payload);
    res.status(200).json(payload);
  };
}

export function getReadyHandler(deps: HealthRouterDeps) {
  return async (_req: Request, res: Response): Promise<void> => {
    const checks = await Promise.all([
      checkPostgres(deps.clients.prisma),
      checkRedis(deps.clients.redis),
    ]);

    const hasError = checks.some((check) => check.status === 'error');
    const hasDegraded = checks.some((check) => check.status === 'degraded');

    const payload: ReadinessResponse = {
      status: hasError ? 'error' : hasDegraded ? 'degraded' : 'ok',
      service: deps.serviceName,
      timestamp: new Date().toISOString(),
      checks,
    };

    readinessResponseSchema.parse(payload);
    res.status(hasError ? 503 : 200).json(payload);
  };
}
