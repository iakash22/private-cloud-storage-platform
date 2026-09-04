import type { Logger } from '@vaultstack/logger';
import type { Request, Response, NextFunction } from 'express';
import type { ApiErrorResponse } from '@vaultstack/types';

export function createErrorHandler(logger: Logger) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    logger.error({ err: error }, 'Unhandled request error');

    const payload: ApiErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };

    res.status(500).json(payload);
  };
}

export function createNotFoundHandler() {
  return (_req: Request, res: Response): void => {
    const payload: ApiErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    };

    res.status(404).json(payload);
  };
}
