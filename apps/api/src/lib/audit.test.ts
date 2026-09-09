import type { PrismaClient } from '@vaultstack/database';
import { describe, expect, it, vi } from 'vitest';
import { runRequestContext } from './request-context.js';
import { sanitizeAuditMetadata, writeAuditLog } from './audit.js';

describe('audit logging', () => {
  it('removes sensitive values from metadata', () => {
    expect(
      sanitizeAuditMetadata({
        safe: 'value',
        password: 'do-not-store',
        nested: {
          authorization: 'Bearer secret',
          presignedUrl: 'https://storage.example.test/file?X-Amz-Signature=secret',
          count: 2,
        },
      }),
    ).toEqual({
      safe: 'value',
      nested: { count: 2 },
    });
  });

  it('preserves null metadata fields', () => {
    expect(
      sanitizeAuditMetadata({
        name: 'aws-default',
        dialect: 'AWS_S3',
        endpoint: null,
        isDefault: false,
      }),
    ).toEqual({
      name: 'aws-default',
      dialect: 'AWS_S3',
      endpoint: null,
      isDefault: false,
    });
  });

  it('adds request context fields without logging secrets', async () => {
    const create = vi.fn(async () => undefined);
    const prisma = {
      auditLog: { create },
      user: { findUnique: vi.fn(async () => ({ id: 'user-1' })) },
    } as unknown as PrismaClient;

    await runRequestContext(
      {
        requestId: 'request-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
      () =>
        writeAuditLog(prisma, {
          organizationId: 'org-1',
          userId: 'user-1',
          action: 'object.upload',
          resourceType: 'object',
          resourceId: 'object-1',
          metadata: { key: 'report.txt', secretKey: 'never-store' },
        }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request-1',
        ipAddress: '127.0.0.1',
        result: 'success',
        metadata: { key: 'report.txt' },
      }),
    });
  });
});
