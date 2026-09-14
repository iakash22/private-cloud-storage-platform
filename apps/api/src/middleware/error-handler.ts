import { Prisma } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { ApiErrorResponse, ApiFieldErrors } from '@vaultstack/types';
import { fieldErrorsFromZod, formatZodError } from '@vaultstack/validation';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

function payload(
  req: Request,
  code: string,
  message: string,
  fields?: ApiFieldErrors,
): ApiErrorResponse {
  return {
    error: fields && Object.keys(fields).length > 0 ? { code, message, fields } : { code, message },
    requestId: req.requestId,
  };
}

function stringMeta(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function prismaUniqueFields(error: Prisma.PrismaClientKnownRequestError): ApiFieldErrors {
  const target = error.meta?.target;
  const fields: ApiFieldErrors = {};
  const message = 'A record with that value already exists';

  if (Array.isArray(target)) {
    for (const name of target) {
      if (typeof name === 'string' && name.length > 0) {
        fields[name] = message;
      }
    }
  } else if (typeof target === 'string' && target.length > 0) {
    fields[target] = message;
  }

  return fields;
}

function prismaDependencyFields(error: Prisma.PrismaClientKnownRequestError): ApiFieldErrors {
  const fieldName =
    stringMeta(error.meta?.field_name) ?? stringMeta(error.meta?.fieldName);
  if (!fieldName) {
    return {};
  }

  return { [fieldName]: 'Related record was not found' };
}

function isPrismaUnreachable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1017';
}

export function createErrorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof AppError) {
      if (error.retryAfterSeconds) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      res.status(error.statusCode).json(payload(req, error.code, error.message, error.fields));
      return;
    }

    if (error instanceof ZodError) {
      const fields = fieldErrorsFromZod(error);
      res.status(400).json(payload(req, 'VALIDATION_ERROR', formatZodError(error), fields));
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json(
        payload(req, 'CONFLICT', 'A record with that value already exists', prismaUniqueFields(error)),
      );
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(409).json(
        payload(
          req,
          'DEPENDENCY_ERROR',
          'A related record is missing or cannot be referenced',
          prismaDependencyFields(error),
        ),
      );
      return;
    }

    if (isPrismaUnreachable(error)) {
      res.status(503).json(
        payload(req, 'DEPENDENCY_ERROR', 'A required backend dependency is unavailable'),
      );
      return;
    }

    logger.error({ err: error, requestId: req.requestId }, 'Unhandled request error');

    res.status(500).json(payload(req, 'INTERNAL_ERROR', 'An unexpected error occurred'));
  };
}

export function createNotFoundHandler() {
  return (req: Request, res: Response): void => {
    res.status(404).json(payload(req, 'NOT_FOUND', 'Route not found'));
  };
}
