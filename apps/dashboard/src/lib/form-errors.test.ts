import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@vaultstack/api-client';
import { parseRequestError } from './form-errors.js';

describe('parseRequestError', () => {
  it('keeps API field errors separate from the toast message', () => {
    const error = new ApiClientError(
      'VALIDATION_ERROR',
      'email: Invalid email',
      400,
      'req-1',
      { email: 'Invalid email' },
    );

    expect(parseRequestError(error)).toEqual({
      message: 'email: Invalid email',
      code: 'VALIDATION_ERROR',
      fields: { email: 'Invalid email' },
      status: 400,
      sessionHandled: false,
    });
  });

  it('keeps generic API errors without fields', () => {
    const error = new ApiClientError('FORBIDDEN', 'You cannot grant that role', 403, 'req-2');
    expect(parseRequestError(error)).toEqual({
      message: 'You cannot grant that role',
      code: 'FORBIDDEN',
      fields: {},
      status: 403,
      sessionHandled: false,
    });
  });

  it('uses optional chaining for missing field maps', () => {
    const error = new ApiClientError('DEPENDENCY_ERROR', 'Related record missing', 409, 'req-3');
    expect(parseRequestError(error).fields ?? {}).toEqual({});
  });

  it('maps server failures to a safe internal error message', () => {
    const error = new ApiClientError(
      'INTERNAL_ERROR',
      'prisma.$queryRaw failed: connection refused',
      500,
      'req-5',
    );
    expect(parseRequestError(error)).toEqual({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      fields: {},
      status: 500,
      sessionHandled: false,
    });
  });

  it('surfaces 401 and 404 API messages for toasts', () => {
    const unauthorized = new ApiClientError(
      'UNAUTHORIZED',
      'Invalid email or password',
      401,
      'req-6',
    );
    expect(parseRequestError(unauthorized).message).toBe('Invalid email or password');

    const missing = new ApiClientError('NOT_FOUND', 'Bucket not found', 404, 'req-7');
    expect(parseRequestError(missing)).toMatchObject({
      message: 'Bucket not found',
      status: 404,
    });

    const empty404 = new ApiClientError('NOT_FOUND', '', 404, 'req-8');
    expect(parseRequestError(empty404).message).toBe('Not found');
  });

  it('falls back to a generic message for unknown failures', () => {
    expect(parseRequestError({})).toEqual({ message: 'Request failed', fields: {} });
  });
});
