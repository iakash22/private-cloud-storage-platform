import type { EnvConfig } from '@vaultstack/config';
import { CSRF_HEADER_NAME, ORGANIZATION_HEADER_NAME } from '@vaultstack/types';
import type { NextFunction, Request, Response } from 'express';

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function resolveCorsOrigins(config: EnvConfig): Set<string> {
  if (config.CORS_ORIGINS !== undefined) {
    return new Set(
      config.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    );
  }

  if (config.NODE_ENV === 'production') {
    return new Set();
  }

  return new Set(DEFAULT_DEV_ORIGINS);
}

export function createCorsMiddleware(config: EnvConfig) {
  const allowed = resolveCorsOrigins(config);
  const allowHeaders = [
    'Accept',
    'Content-Type',
    CSRF_HEADER_NAME,
    ORGANIZATION_HEADER_NAME,
  ].join(', ');

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header('origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', allowHeaders);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
      res.vary('Origin');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
