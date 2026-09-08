import type { EnvConfig } from '@vaultstack/config';
import { hashToken } from '@vaultstack/auth';
import type { NextFunction, Request, Response } from 'express';
import { rateLimited } from '../lib/errors.js';
import type { RateLimiter } from '../lib/rate-limit.js';

function clientIp(req: Request): string {
  // Both can be an empty string, not just undefined, so emptiness is checked
  // explicitly rather than with ?? (which would accept '').
  const candidates = [req.ip, req.socket.remoteAddress];
  return candidates.find((value) => value !== undefined && value.length > 0) ?? 'unknown';
}

export function createApiRateLimitMiddleware(limiter: RateLimiter, config: EnvConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await limiter.consume(
        `api:${clientIp(req)}`,
        config.API_RATE_LIMIT_MAX,
        config.API_RATE_LIMIT_WINDOW_SECONDS,
      );
      if (!result.allowed) {
        throw rateLimited(result.retryAfterSeconds);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createLoginRateLimitMiddleware(limiter: RateLimiter, config: EnvConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as { email?: unknown };
      const email = typeof body.email === 'string' ? body.email.toLowerCase() : 'unknown';
      const ip = clientIp(req);
      const [perAccount, perIp] = await Promise.all([
        limiter.consume(
          `login:${ip}:${email}`,
          config.LOGIN_RATE_LIMIT_MAX,
          config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        ),
        limiter.consume(
          `login-ip:${ip}`,
          config.LOGIN_RATE_LIMIT_MAX * 4,
          config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        ),
      ]);

      if (!perAccount.allowed) {
        throw rateLimited(perAccount.retryAfterSeconds);
      }
      if (!perIp.allowed) {
        throw rateLimited(perIp.retryAfterSeconds);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createSharePasswordRateLimitMiddleware(limiter: RateLimiter, config: EnvConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.params.token;
      const token = Array.isArray(raw) ? raw[0] : raw;
      const ip = clientIp(req);
      const result = await limiter.consume(
        `share-pw:${ip}:${hashToken(token ?? 'unknown').slice(0, 16)}`,
        config.LOGIN_RATE_LIMIT_MAX,
        config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
      );
      if (!result.allowed) {
        throw rateLimited(result.retryAfterSeconds);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createS3RateLimitMiddleware(limiter: RateLimiter, config: EnvConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authorization = req.header('authorization') ?? 'anonymous';
      const accessKey = /Credential=([^/]+)/.exec(authorization)?.[1] ?? 'anonymous';
      const result = await limiter.consume(
        `s3:${clientIp(req)}:${hashToken(accessKey).slice(0, 16)}`,
        config.API_RATE_LIMIT_MAX,
        config.API_RATE_LIMIT_WINDOW_SECONDS,
      );
      if (!result.allowed) {
        throw rateLimited(result.retryAfterSeconds);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
