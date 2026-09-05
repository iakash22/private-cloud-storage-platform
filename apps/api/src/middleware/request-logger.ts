import type { Logger } from '@vaultstack/logger';
import type { NextFunction, Request, Response } from 'express';

export function createRequestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();

    res.on('finish', () => {
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
        'request completed',
      );
    });

    next();
  };
}
