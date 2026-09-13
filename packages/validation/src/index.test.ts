import { describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  completeMultipartBodySchema,
  confirmMultipartPartBodySchema,
  createBackupJobBodySchema,
  createBackupRestoreBodySchema,
  createBackupScheduleBodySchema,
  createLifecyclePolicyBodySchema,
  createProjectBodySchema,
  createShareBodySchema,
  createStorageProviderBodySchema,
  healthResponseSchema,
  createS3CredentialBodySchema,
  updateS3CredentialBodySchema,
  infrastructureCollectorStatusSchema,
  initiateArtifactBodySchema,
  initiateMultipartBodySchema,
  listMultipartSessionsQuerySchema,
  listObjectsQuerySchema,
  multipartPartParamsSchema,
  parseForm,
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

  it('maps zod issues onto field error keys', () => {
    const parsed = parseForm(registerBodySchema, {
      email: 'not-an-email',
      password: 'short',
      name: '',
      organizationName: 'Acme',
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.fields.email).toBeDefined();
      expect(parsed.fields.password).toBeDefined();
      expect(parsed.fields.name).toBeDefined();
    }
  });

  it('validates API error envelope with requestId and optional field errors', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code: 'FORBIDDEN', message: 'denied' },
      requestId: 'req-1',
    });

    expect(result.success).toBe(true);

    const withFields = apiErrorResponseSchema.safeParse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'email: Invalid email',
        fields: { email: 'Invalid email' },
      },
      requestId: 'req-2',
    });
    expect(withFields.success).toBe(true);
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
    expect(multipartPartParamsSchema.parse({ uploadId: 'upload-1', partNumber: '2' })).toEqual({
      uploadId: 'upload-1',
      partNumber: 2,
    });
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
    expect(listMultipartSessionsQuerySchema.safeParse({ status: 'FAILED' }).success).toBe(false);
  });

  it('validates advanced object filters and rejects inverted ranges', () => {
    expect(
      listObjectsQuerySchema.safeParse({
        minSize: '10',
        maxSize: '100',
        externallyShared: 'true',
        modifiedFrom: '2026-01-01T00:00:00.000Z',
        modifiedTo: '2026-01-02T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(listObjectsQuerySchema.parse({ externallyShared: 'false' }).externallyShared).toBe(false);
    expect(
      listObjectsQuerySchema.safeParse({
        minSize: 100,
        maxSize: 10,
      }).success,
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
    expect(updateBucketVersioningBodySchema.safeParse({ versioning: 'SUSPENDED' }).success).toBe(
      true,
    );
  });

  it('validates share creation visibility, team, and permissions', () => {
    expect(
      createShareBodySchema.safeParse({
        visibility: 'PUBLIC_LINK',
        password: 'sharepass1',
        allowDownload: true,
      }).success,
    ).toBe(true);
    expect(
      createShareBodySchema.safeParse({
        visibility: 'TEAM',
      }).success,
    ).toBe(false);
    expect(
      createShareBodySchema.safeParse({
        visibility: 'PUBLIC_LINK',
        allowView: false,
        allowDownload: false,
      }).success,
    ).toBe(false);
  });

  it('requires S3 dialect and credentials when creating a storage provider', () => {
    expect(
      createStorageProviderBodySchema.safeParse({
        name: 'minio',
        dialect: 'MINIO',
        endpoint: 'http://127.0.0.1:9000',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      }).success,
    ).toBe(true);
    expect(
      createStorageProviderBodySchema.safeParse({
        name: 'minio',
        dialect: 'NOT_A_VENDOR',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      }).success,
    ).toBe(false);
  });

  it('validates CI artifact project and upload payloads', () => {
    expect(
      createProjectBodySchema.safeParse({
        name: 'api',
        slug: 'api-service',
        retentionDays: 30,
      }).success,
    ).toBe(true);
    expect(createProjectBodySchema.safeParse({ name: 'api', slug: 'API' }).success).toBe(false);
    expect(
      initiateArtifactBodySchema.safeParse({
        name: 'app.tar.gz',
        kind: 'BUNDLE',
        size: 12,
      }).success,
    ).toBe(true);
    expect(
      initiateArtifactBodySchema.safeParse({
        name: 'app.tar.gz',
        kind: 'NOT_A_KIND',
      }).success,
    ).toBe(false);
  });

  it('validates backup job and schedule bodies', () => {
    expect(
      createBackupJobBodySchema.safeParse({
        targets: ['VAULTSTACK_METADATA'],
      }).success,
    ).toBe(true);
    expect(createBackupJobBodySchema.safeParse({ targets: [] }).success).toBe(false);
    expect(
      createBackupScheduleBodySchema.safeParse({
        name: 'nightly',
        targets: ['VAULTSTACK_METADATA', 'VAULTSTACK_OBJECT_METADATA'],
        intervalMinutes: 1440,
        retentionDays: 14,
      }).success,
    ).toBe(true);
    expect(createBackupRestoreBodySchema.safeParse({ snapshotId: 'snap-1' }).success).toBe(true);
  });

  it('validates service-account permissions and lifecycle updates', () => {
    expect(
      createS3CredentialBodySchema.safeParse({
        serviceAccountName: 'ci-service',
        permissions: ['storage.read', 'artifact.read', 'backup.read'],
        allowedBucketNames: ['artifacts'],
      }).success,
    ).toBe(true);
    expect(
      createS3CredentialBodySchema.safeParse({
        serviceAccountName: 'ci-service',
        permissions: ['users.manage'],
      }).success,
    ).toBe(false);
    expect(
      updateS3CredentialBodySchema.safeParse({
        permissions: ['storage.read'],
        expiresAt: null,
      }).success,
    ).toBe(true);
  });

  it('accepts infrastructure collector statuses', () => {
    expect(infrastructureCollectorStatusSchema.safeParse('ok').success).toBe(true);
    expect(infrastructureCollectorStatusSchema.safeParse('degraded').success).toBe(true);
    expect(infrastructureCollectorStatusSchema.safeParse('unavailable').success).toBe(true);
    expect(infrastructureCollectorStatusSchema.safeParse('running').success).toBe(false);
  });
});
