import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runRequestContext } from '../lib/request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  runRequestContext(
    {
      requestId,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    },
    next,
  );
}
