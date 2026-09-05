import { Prisma } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { ApiErrorResponse } from '@vaultstack/types';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ');
}

export function createErrorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.requestId;

    if (error instanceof AppError) {
      const payload: ApiErrorResponse = {
        error: { code: error.code, message: error.message },
        requestId,
      };
      res.status(error.statusCode).json(payload);
      return;
    }

    if (error instanceof ZodError) {
      const payload: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: formatZodError(error) },
        requestId,
      };
      res.status(400).json(payload);
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const payload: ApiErrorResponse = {
        error: { code: 'CONFLICT', message: 'A record with that value already exists' },
        requestId,
      };
      res.status(409).json(payload);
      return;
    }

    logger.error({ err: error, requestId }, 'Unhandled request error');

    const payload: ApiErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
      requestId,
    };

    res.status(500).json(payload);
  };
}

export function createNotFoundHandler() {
  return (req: Request, res: Response): void => {
    const payload: ApiErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
      requestId: req.requestId,
    };

    res.status(404).json(payload);
  };
}
