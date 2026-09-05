import { Readable } from 'node:stream';
import { MultipartUploadStatus, UploadStatus } from '@vaultstack/database';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/errors.js';
import { ObjectTooLargeError } from '../domain/integrity.js';
import { createUploadService, type UploadService } from './upload.service.js';
import type { StorageLimits } from './storage.service.js';

const MAX_OBJECT_SIZE = 1_000;
const ORG = 'org-1';
const BUCKET = 'bucket-1';

const LIMITS: StorageLimits = {
  maxObjectSizeBytes: MAX_OBJECT_SIZE,
  maxRequestSizeBytes: 64 * 1024 * 1024,
  multipartMinPartSizeBytes: 5,
  multipartMaxParts: 10_000,
  maxMetadataBytes: 2048,
  maxKeyLength: 1024,
  presignedUrlTtlSeconds: 900,
  uploadTtlSeconds: 3600,
};

const META = { ipAddress: null, userAgent: null };

function future(): Date {
  return new Date(Date.now() + 60_000);
}

interface Harness {
  service: UploadService;
  provider: {
    capabilities: { nativePresignedUrls: boolean };
    uploadPart: ReturnType<typeof vi.fn>;
    completeMultipartUpload: ReturnType<typeof vi.fn>;
    headObject: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
    putObject: ReturnType<typeof vi.fn>;
    createPresignedUploadUrl: ReturnType<typeof vi.fn>;
  };
  uploads: Record<string, ReturnType<typeof vi.fn>>;
  objects: Record<string, ReturnType<typeof vi.fn>>;
}

/**
 * Builds the upload service over fakes.
 *
 * Everything below the service (provider, repositories, Prisma) is stubbed so
 * the tests assert the service's own enforcement decisions rather than
 * filesystem or database behaviour.
 */
function harness(
  overrides: {
    nativePresignedUrls?: boolean;
    parts?: { partNumber: number; size: number; etag: string }[];
    upload?: Record<string, unknown>;
    multipart?: Record<string, unknown>;
    headSize?: number;
  } = {},
): Harness {
  const provider = {
    capabilities: { nativePresignedUrls: overrides.nativePresignedUrls ?? false },
    uploadPart: vi.fn(
      async (input: { partNumber: number; body: Readable; maxSizeBytes: number }) => {
        // Mirrors the real providers: the meter aborts as soon as the budget the
        // service handed down is exceeded.
        const chunks: Buffer[] = [];
        for await (const chunk of input.body) {
          chunks.push(chunk as Buffer);
        }
        const size = Buffer.concat(chunks).length;
        if (size > input.maxSizeBytes) {
          throw new ObjectTooLargeError(input.maxSizeBytes);
        }
        return { partNumber: input.partNumber, size, etag: `etag-${input.partNumber}` };
      },
    ),
    completeMultipartUpload: vi.fn(() =>
      Promise.resolve({
        size: 10,
        etag: 'combined-etag',
        checksum: { algorithm: 'NONE' as const, value: '' },
        contentType: 'application/octet-stream',
      }),
    ),
    headObject: vi.fn(() =>
      Promise.resolve({
        size: overrides.headSize ?? 10,
        contentType: 'application/octet-stream',
        etag: 'etag',
        lastModified: new Date(),
      }),
    ),
    deleteObject: vi.fn(() => Promise.resolve(undefined)),
    putObject: vi.fn(() =>
      Promise.resolve({
        size: 10,
        etag: 'etag',
        checksum: { algorithm: 'SHA256' as const, value: 'a'.repeat(64) },
        contentType: 'application/octet-stream',
      }),
    ),
    createPresignedUploadUrl: vi.fn(() =>
      Promise.resolve({
        url: 'https://s3.example/signed',
        method: 'PUT' as const,
        expiresAt: future(),
      }),
    ),
  };

  const uploadRow = {
    id: 'upload-1',
    organizationId: ORG,
    bucketId: BUCKET,
    key: 'docs/report.pdf',
    status: UploadStatus.UPLOADING,
    contentType: null,
    declaredSize: null,
    checksum: null,
    stagingKey: `${ORG}/ab/object-1/version-1`,
    expiresAt: future(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides.upload,
  };

  const multipartRow = {
    id: 'multipart-1',
    organizationId: ORG,
    bucketId: BUCKET,
    key: 'docs/big.bin',
    status: MultipartUploadStatus.UPLOADING,
    contentType: null,
    providerUploadId: 'provider-upload-1',
    stagingKey: `${ORG}/ab/object-2/version-2`,
    expiresAt: future(),
    createdAt: new Date(),
    ...overrides.multipart,
  };

  const parts = (overrides.parts ?? []).map((part) => ({
    ...part,
    size: BigInt(part.size),
  }));

  const uploads = {
    create: vi.fn((input: Record<string, unknown>) => Promise.resolve({ ...uploadRow, ...input })),
    findById: vi.fn(() => Promise.resolve(uploadRow)),
    findByTokenHash: vi.fn(() => Promise.resolve(uploadRow)),
    setStatus: vi.fn(() => Promise.resolve(uploadRow)),
    markCompleted: vi.fn(() => Promise.resolve(uploadRow)),
    expireStale: vi.fn(() => Promise.resolve(0)),
    createMultipart: vi.fn(() => Promise.resolve(multipartRow)),
    findMultipartById: vi.fn(() => Promise.resolve(multipartRow)),
    setMultipartStatus: vi.fn(() => Promise.resolve(multipartRow)),
    upsertPart: vi.fn(() => Promise.resolve(parts[0])),
    listParts: vi.fn(() => Promise.resolve(parts)),
    deleteMultipart: vi.fn(() => Promise.resolve(undefined)),
    findStaleMultipart: vi.fn(() => Promise.resolve([])),
  };

  const objects = {
    findByKey: vi.fn(() => Promise.resolve(null)),
    findById: vi.fn(() => Promise.resolve(null)),
  };

  const storage = {
    limits: LIMITS,
    resolveBucket: vi.fn(() =>
      Promise.resolve({
        bucket: { id: BUCKET },
        providerRecord: { id: 'provider-record-1' },
        provider,
      }),
    ),
    locationFor: vi.fn((_bucket: unknown, physicalKey: string) => ({
      physicalBucket: `vs-${BUCKET}`,
      physicalKey,
    })),
    physicalKeyFor: vi.fn(() => `${ORG}/ab/object-1/version-1`),
    newObjectId: vi.fn(() => 'object-1'),
    newVersionId: vi.fn(() => 'version-1'),
  };

  const prisma = {
    auditLog: { create: vi.fn(() => Promise.resolve(undefined)) },
    upload: { update: vi.fn(() => Promise.resolve(uploadRow)) },
  };

  const service = createUploadService({
    prisma: prisma as never,
    uploads: uploads as never,
    objects: objects as never,
    storage: storage as never,
    tokens: {
      issue: vi.fn(() => ({ token: 'plaintext-token', expiresAt: future() })),
      verify: vi.fn(() => ({
        purpose: 'upload' as const,
        organizationId: ORG,
        subjectId: 'object-1',
        expiresAt: future(),
      })),
    },
    metrics: {
      uploadStarted: vi.fn(),
      uploadFailed: vi.fn(),
      uploadCompleted: vi.fn(),
      downloadCompleted: vi.fn(),
      multipartCompleted: vi.fn(),
    } as never,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
  });

  return { service, provider, uploads, objects };
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('Expected the operation to be rejected but it succeeded');
}

describe('upload service size enforcement', () => {
  describe('multipart', () => {
    it('caps a part against the budget left by the parts already stored', async () => {
      const { service, provider } = harness({
        parts: [{ partNumber: 1, size: 900, etag: 'etag-1' }],
      });

      await service.uploadPart({
        organizationId: ORG,
        uploadId: 'multipart-1',
        partNumber: 2,
        body: Readable.from([Buffer.alloc(50)]),
      });

      // 1000 total ceiling minus the 900 bytes part 1 already occupies.
      expect(provider.uploadPart.mock.calls[0]?.[0]).toMatchObject({ maxSizeBytes: 100 });
    });

    it('rejects a part that would push the assembled object past the ceiling', async () => {
      const { service } = harness({
        parts: [{ partNumber: 1, size: 900, etag: 'etag-1' }],
      });

      const code = await codeOf(() =>
        service.uploadPart({
          organizationId: ORG,
          uploadId: 'multipart-1',
          partNumber: 2,
          body: Readable.from([Buffer.alloc(500)]),
        }),
      );

      expect(code).toBe('STORAGE_OBJECT_TOO_LARGE');
    });

    it('reports the configured ceiling, not the budget left for this part', async () => {
      const { service } = harness({
        parts: [{ partNumber: 1, size: 900, etag: 'etag-1' }],
      });

      // The provider sees a 100-byte budget; the caller must still be told what
      // the real limit is.
      await expect(
        service.uploadPart({
          organizationId: ORG,
          uploadId: 'multipart-1',
          partNumber: 2,
          body: Readable.from([Buffer.alloc(500)]),
        }),
      ).rejects.toThrow(String(MAX_OBJECT_SIZE));
    });

    it('rejects a new part once the stored parts already fill the ceiling', async () => {
      const { service, provider } = harness({
        parts: [{ partNumber: 1, size: MAX_OBJECT_SIZE, etag: 'etag-1' }],
      });

      const code = await codeOf(() =>
        service.uploadPart({
          organizationId: ORG,
          uploadId: 'multipart-1',
          partNumber: 2,
          body: Readable.from([Buffer.alloc(1)]),
        }),
      );

      expect(code).toBe('STORAGE_OBJECT_TOO_LARGE');
      // Refused before any bytes reach the provider.
      expect(provider.uploadPart).not.toHaveBeenCalled();
    });

    it('excludes the part being replaced from the budget it is measured against', async () => {
      const { service, provider } = harness({
        parts: [
          { partNumber: 1, size: 400, etag: 'etag-1' },
          { partNumber: 2, size: 400, etag: 'etag-2' },
        ],
      });

      await service.uploadPart({
        organizationId: ORG,
        uploadId: 'multipart-1',
        partNumber: 2,
        body: Readable.from([Buffer.alloc(100)]),
      });

      // Only part 1's 400 bytes count; re-uploading part 2 replaces its own.
      expect(provider.uploadPart.mock.calls[0]?.[0]).toMatchObject({ maxSizeBytes: 600 });
    });

    it('refuses to assemble parts that together exceed the ceiling', async () => {
      const { service, provider } = harness({
        parts: [
          { partNumber: 1, size: 600, etag: 'etag-1' },
          { partNumber: 2, size: 600, etag: 'etag-2' },
        ],
      });

      const code = await codeOf(() =>
        service.completeMultipart({
          organizationId: ORG,
          uploadId: 'multipart-1',
          userId: 'user-1',
          parts: [
            { partNumber: 1, etag: 'etag-1' },
            { partNumber: 2, etag: 'etag-2' },
          ],
          meta: META,
        }),
      );

      expect(code).toBe('STORAGE_OBJECT_TOO_LARGE');
      expect(provider.completeMultipartUpload).not.toHaveBeenCalled();
    });
  });

  describe('completion', () => {
    it('rejects bytes that landed oversized without streaming through the API', async () => {
      const { service, provider } = harness({ headSize: MAX_OBJECT_SIZE + 1 });

      const code = await codeOf(() =>
        service.complete({
          organizationId: ORG,
          uploadId: 'upload-1',
          userId: 'user-1',
          meta: META,
        }),
      );

      expect(code).toBe('STORAGE_OBJECT_TOO_LARGE');
      // The oversized bytes are reclaimed rather than left staged.
      expect(provider.deleteObject).toHaveBeenCalled();
    });

    it('refuses a checksum it has no server-computed value to compare against', async () => {
      const { service, provider } = harness({ upload: { checksum: null } });

      const code = await codeOf(() =>
        service.complete({
          organizationId: ORG,
          uploadId: 'upload-1',
          userId: 'user-1',
          checksumSha256: 'b'.repeat(64),
          meta: META,
        }),
      );

      expect(code).toBe('STORAGE_CHECKSUM_UNVERIFIABLE');
      expect(provider.deleteObject).toHaveBeenCalled();
    });

    it('still rejects a checksum that does not match the bytes received', async () => {
      const { service } = harness({ upload: { checksum: 'a'.repeat(64) } });

      const code = await codeOf(() =>
        service.complete({
          organizationId: ORG,
          uploadId: 'upload-1',
          userId: 'user-1',
          checksumSha256: 'b'.repeat(64),
          meta: META,
        }),
      );

      expect(code).toBe('STORAGE_CHECKSUM_MISMATCH');
    });
  });

  describe('provider-presigned uploads', () => {
    it('refuses to hand out a signed URL that is not bound to a size', async () => {
      const { service, provider } = harness({ nativePresignedUrls: true });

      const code = await codeOf(() =>
        service.initiate({
          organizationId: ORG,
          bucketId: BUCKET,
          key: 'docs/report.pdf',
          userId: 'user-1',
          baseUrl: 'https://vaultstack.example',
          meta: META,
        }),
      );

      expect(code).toBe('VALIDATION_ERROR');
      expect(provider.createPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('binds the declared size into the signed URL', async () => {
      const { service, provider } = harness({ nativePresignedUrls: true });

      await service.initiate({
        organizationId: ORG,
        bucketId: BUCKET,
        key: 'docs/report.pdf',
        size: 512,
        userId: 'user-1',
        baseUrl: 'https://vaultstack.example',
        meta: META,
      });

      expect(provider.createPresignedUploadUrl.mock.calls[0]?.[0]).toMatchObject({
        contentLength: 512,
      });
    });

    it('rejects a declared size above the ceiling before signing anything', async () => {
      const { service, provider } = harness({ nativePresignedUrls: true });

      const code = await codeOf(() =>
        service.initiate({
          organizationId: ORG,
          bucketId: BUCKET,
          key: 'docs/report.pdf',
          size: MAX_OBJECT_SIZE + 1,
          userId: 'user-1',
          baseUrl: 'https://vaultstack.example',
          meta: META,
        }),
      );

      expect(code).toBe('STORAGE_OBJECT_TOO_LARGE');
      expect(provider.createPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });
});
