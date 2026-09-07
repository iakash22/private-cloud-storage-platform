import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncRouteHandler = RequestHandler;

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
): AsyncRouteHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
