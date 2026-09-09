import { Prisma } from '@vaultstack/database';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError, dependencyError, validationError } from '../lib/errors.js';
import { createErrorHandler, createNotFoundHandler } from './error-handler.js';
import type { Request, Response } from 'express';

function run(
  error: unknown,
): { status: number; body: { error: { code: string; message: string; fields?: Record<string, string> } } } {
  let status = 0;
  let body: { error: { code: string; message: string; fields?: Record<string, string> } } | undefined;
  const res = {
    setHeader: vi.fn(),
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: { error: { code: string; message: string; fields?: Record<string, string> } }) {
      body = payload;
      return this;
    },
  } as unknown as Response;

  createErrorHandler({ error: vi.fn() } as never)(error, { requestId: 'req-1' } as Request, res, vi.fn());

  if (!body) {
    throw new Error('Error handler did not write a body');
  }

  return { status, body };
}

describe('error handler', () => {
  it('returns field errors from Zod validation failures', () => {
    const schema = z.object({ email: z.string().email(), name: z.string().min(1) });
    const parsed = schema.safeParse({ email: 'not-an-email', name: '' });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    const result = run(parsed.error);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
    expect(result.body.error.fields?.email).toMatch(/email/i);
    expect(result.body.error.fields?.name).toBeDefined();
  });

  it('returns AppError field maps for validation and dependency errors', () => {
    const validation = run(validationError('Invalid bucket', { name: 'Bucket name is not valid' }));
    expect(validation.body.error.fields?.name).toBe('Bucket name is not valid');

    const dependency = run(
      dependencyError('Related record missing', { teamId: 'Team not found in this organization' }),
    );
    expect(dependency.status).toBe(409);
    expect(dependency.body.error.code).toBe('DEPENDENCY_ERROR');
    expect(dependency.body.error.fields?.teamId).toBe('Team not found in this organization');
  });

  it('maps unique constraint failures onto fields', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });

    const result = run(error);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT');
    expect(result.body.error.fields?.email).toBe('A record with that value already exists');
  });

  it('maps foreign-key failures as dependency errors', () => {
    const error = new Prisma.PrismaClientKnownRequestError('FK failed', {
      code: 'P2003',
      clientVersion: 'test',
      meta: { field_name: 'bucketId' },
    });

    const result = run(error);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('DEPENDENCY_ERROR');
    expect(result.body.error.fields?.bucketId).toBe('Related record was not found');
  });

  it('keeps retry-after for rate limits', () => {
    const result = run(new AppError(429, 'RATE_LIMITED', 'slow down', { retryAfterSeconds: 12 }));
    expect(result.status).toBe(429);
    expect(result.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('not-found handler', () => {
  it('returns a route not found envelope', () => {
    let status = 0;
    let body: unknown;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as unknown as Response;

    createNotFoundHandler()({ requestId: 'req-2' } as Request, res);
    expect(status).toBe(404);
    expect(body).toMatchObject({ error: { code: 'NOT_FOUND' }, requestId: 'req-2' });
  });
});
