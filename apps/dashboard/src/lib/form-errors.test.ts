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
    });
  });

  it('keeps generic API errors without fields', () => {
    const error = new ApiClientError('FORBIDDEN', 'You cannot grant that role', 403, 'req-2');
    expect(parseRequestError(error)).toEqual({
      message: 'You cannot grant that role',
      code: 'FORBIDDEN',
      fields: {},
    });
  });

  it('uses optional chaining for missing field maps', () => {
    const error = new ApiClientError('DEPENDENCY_ERROR', 'Related record missing', 409, 'req-3');
    expect(parseRequestError(error).fields ?? {}).toEqual({});
  });

  it('falls back to a generic message for unknown failures', () => {
    expect(parseRequestError({})).toEqual({ message: 'Request failed', fields: {} });
  });
});
