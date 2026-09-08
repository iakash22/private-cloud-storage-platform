import { describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  completeMultipartBodySchema,
  confirmMultipartPartBodySchema,
  createLifecyclePolicyBodySchema,
  healthResponseSchema,
  initiateMultipartBodySchema,
  listMultipartSessionsQuerySchema,
  multipartPartParamsSchema,
  multipartPartQuerySchema,
  readinessResponseSchema,
  registerBodySchema,
  updateBucketVersioningBodySchema,
} from './index.js';

describe('@vaultstack/validation', () => {
  it('validates health response', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime: 1,
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid readiness response', () => {
    const result = readinessResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      timestamp: 'not-a-date',
      checks: [],
    });

    expect(result.success).toBe(false);
  });

  it('normalizes register emails and rejects short passwords', () => {
    const valid = registerBodySchema.safeParse({
      email: 'Owner@Example.com',
      password: 'password123',
      name: 'Owner',
      organizationName: 'Acme',
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe('owner@example.com');
    }

    const tooShort = registerBodySchema.safeParse({
      email: 'owner@example.com',
      password: 'short',
      name: 'Owner',
      organizationName: 'Acme',
    });
    expect(tooShort.success).toBe(false);

    const lettersOnly = registerBodySchema.safeParse({
      email: 'owner@example.com',
      password: 'passwordonly',
      name: 'Owner',
      organizationName: 'Acme',
    });
    expect(lettersOnly.success).toBe(false);
  });

  it('validates API error envelope with requestId', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code: 'FORBIDDEN', message: 'denied' },
      requestId: 'req-1',
    });

    expect(result.success).toBe(true);
  });

  it('requires a nonnegative declared size for multipart initiation', () => {
    expect(
      initiateMultipartBodySchema.safeParse({
        bucketId: 'bucket-1',
        key: 'archive.tar',
      }).success,
    ).toBe(false);
    expect(
      initiateMultipartBodySchema.safeParse({
        bucketId: 'bucket-1',
        key: 'archive.tar',
        size: -1,
      }).success,
    ).toBe(false);
    expect(
      initiateMultipartBodySchema.safeParse({
        bucketId: 'bucket-1',
        key: 'empty',
        size: 0,
      }).success,
    ).toBe(true);
  });

  it('validates multipart part addressing and direct confirmation', () => {
    expect(
      multipartPartParamsSchema.parse({ uploadId: 'upload-1', partNumber: '2' }),
    ).toEqual({ uploadId: 'upload-1', partNumber: 2 });
    expect(multipartPartQuerySchema.safeParse({ partNumber: 10_001 }).success).toBe(false);

    const checksumSha256 = 'a'.repeat(64);
    expect(
      confirmMultipartPartBodySchema.safeParse({
        etag: 'part-etag',
        size: 1024,
        checksumSha256,
      }).success,
    ).toBe(true);
    expect(
      confirmMultipartPartBodySchema.safeParse({
        etag: 'part-etag',
        size: 1024,
        checksumSha256: 'not-a-sha256',
      }).success,
    ).toBe(false);
  });

  it('keeps multipart completion compatible and validates session listing', () => {
    expect(
      completeMultipartBodySchema.safeParse({
        parts: [{ partNumber: 1, etag: 'part-etag' }],
      }).success,
    ).toBe(true);

    expect(
      listMultipartSessionsQuerySchema.parse({
        status: 'UPLOADING',
        limit: '25',
        cursor: 'session-25',
      }),
    ).toEqual({
      status: 'UPLOADING',
      limit: 25,
      cursor: 'session-25',
    });
    expect(
      listMultipartSessionsQuerySchema.safeParse({ status: 'FAILED' }).success,
    ).toBe(false);
  });

  it('validates lifecycle policy creation and bucket versioning updates', () => {
    expect(
      createLifecyclePolicyBodySchema.safeParse({
        name: 'expire-tmp',
        days: 7,
        lifecycleAction: 'EXPIRE_CURRENT',
      }).success,
    ).toBe(true);
    expect(
      createLifecyclePolicyBodySchema.safeParse({
        name: 'expire-tmp',
        days: 0,
        lifecycleAction: 'EXPIRE_CURRENT',
      }).success,
    ).toBe(false);
    expect(
      updateBucketVersioningBodySchema.safeParse({ versioning: 'SUSPENDED' }).success,
    ).toBe(true);
  });
});
