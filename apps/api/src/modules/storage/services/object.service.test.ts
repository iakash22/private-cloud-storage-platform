import { Readable } from 'node:stream';
import { BucketVersioningStatus, ChecksumAlgorithm } from '@vaultstack/database';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/errors.js';
import { createObjectService } from './object.service.js';
import type { StorageLimits } from './storage.service.js';

const ORG = 'org-1';
const BUCKET = 'bucket-1';
const META = { ipAddress: null, userAgent: null };

const LIMITS: StorageLimits = {
  maxObjectSizeBytes: 1_000_000,
  maxRequestSizeBytes: 1_000_000,
  multipartMinPartSizeBytes: 5,
  multipartMaxParts: 10_000,
  maxMetadataBytes: 2048,
  maxKeyLength: 1024,
  presignedUrlTtlSeconds: 900,
  uploadTtlSeconds: 3600,
};

function future(): Date {
  return new Date(Date.now() + 60_000);
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('Expected rejection');
}

function harness(options: { versioning?: BucketVersioningStatus } = {}) {
  const versioning = options.versioning ?? BucketVersioningStatus.ENABLED;
  let objectRow: Record<string, unknown> | null = null;
  const versions: Array<Record<string, unknown>> = [];

  const provider = {
    capabilities: {
      nativePresignedUrls: false,
      nativeVersioning: false,
      serverSideCopy: false,
      directPartDestinations: false,
      providerPartInspection: false,
      capacityChecks: false,
    },
    putObject: vi.fn(async (input: { body: Readable }) => {
      const chunks: Buffer[] = [];
      for await (const chunk of input.body) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks);
      return {
        size: body.length,
        etag: `etag-${body.toString()}`,
        checksum: { algorithm: 'SHA256' as const, value: 'a'.repeat(64) },
        contentType: 'text/plain',
      };
    }),
    getObject: vi.fn(),
    deleteObject: vi.fn(async () => undefined),
    copyObject: vi.fn(async () => ({
      size: 2,
      etag: 'etag-v1',
      checksum: { algorithm: 'SHA256' as const, value: 'a'.repeat(64) },
      contentType: 'text/plain',
    })),
    createPresignedDownloadUrl: vi.fn(),
  };

  const objects = {
    findById: vi.fn(async (organizationId: string) =>
      organizationId === ORG ? objectRow : null,
    ),
    findByKey: vi.fn(async (organizationId: string) =>
      organizationId === ORG ? objectRow : null,
    ),
    list: vi.fn(),
    listPrefixes: vi.fn(),
    create: vi.fn(),
    replace: vi.fn(),
    delete: vi.fn(async () => {
      objectRow = null;
    }),
    updateKey: vi.fn(),
    listVersions: vi.fn(async () => [...versions].sort((a, b) => {
      return String(b.createdAt) < String(a.createdAt) ? -1 : 1;
    })),
    findVersion: vi.fn(async (organizationId: string, _objectId: string, versionId: string) =>
      organizationId === ORG
        ? (versions.find((version) => version.versionId === versionId) ?? null)
        : null,
    ),
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    storageObject: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        objectRow = {
          id: args.data.id,
          organizationId: ORG,
          bucketId: BUCKET,
          storageProviderId: 'provider-1',
          isDeleted: false,
          currentVersionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          checksumAlgorithm: ChecksumAlgorithm.SHA256,
          ...args.data,
        };
        return objectRow;
      }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        objectRow = { ...objectRow, ...args.data, updatedAt: new Date() };
        return objectRow;
      }),
    },
    objectVersion: {
      updateMany: vi.fn(async () => {
        for (const version of versions) {
          version.isCurrent = false;
        }
        return { count: versions.length };
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const version = {
          createdAt: new Date(),
          isDeleteMarker: false,
          ...args.data,
        };
        versions.push(version);
        return version;
      }),
      findMany: vi.fn(async (args: { where?: { isCurrent?: boolean } }) => {
        if (args.where?.isCurrent === false) {
          return versions.filter((version) => version.isCurrent === false);
        }
        return versions;
      }),
      deleteMany: vi.fn(async (args: { where?: { versionId?: string } }) => {
        const versionId = args.where?.versionId;
        const index = versions.findIndex((version) => version.versionId === versionId);
        if (index >= 0) {
          versions.splice(index, 1);
        }
        return { count: 1 };
      }),
    },
    auditLog: { create: vi.fn(async () => undefined) },
  };

  const storage = {
    limits: LIMITS,
    resolveBucket: vi.fn(async () => ({
      bucket: { id: BUCKET, versioning, physicalPrefix: 'phys' },
      providerRecord: { id: 'provider-1' },
      provider,
    })),
    locationFor: vi.fn((_bucket: unknown, physicalKey: string) => ({
      physicalBucket: 'phys',
      physicalKey,
    })),
    physicalKeyFor: vi.fn((input: { versionId: string }) => `org/ab/obj/${input.versionId}`),
    newObjectId: vi.fn(() => 'object-1'),
    newVersionId: vi.fn(() => `version-${versions.length + 1}`),
  };

  const tokens = { issue: vi.fn(() => ({ token: 'tok', expiresAt: future() })) };
  const metrics = {
    uploadStarted: vi.fn(),
    uploadCompleted: vi.fn(),
    uploadFailed: vi.fn(),
  };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const service = createObjectService({
    prisma: prisma as never,
    objects: objects as never,
    storage: storage as never,
    tokens: tokens as never,
    metrics: metrics as never,
    logger: logger as never,
  });

  return { service, provider, versions, getObject: () => objectRow };
}

describe('object versioning', () => {
  it('keeps v1 and v2 when bucket versioning is enabled', async () => {
    const { service, versions } = harness();

    await service.put({
      organizationId: ORG,
      bucketId: BUCKET,
      key: 'note.txt',
      body: Readable.from([Buffer.from('v1')]),
      userId: 'user-1',
    });
    const second = await service.put({
      organizationId: ORG,
      bucketId: BUCKET,
      key: 'note.txt',
      body: Readable.from([Buffer.from('v2')]),
      userId: 'user-1',
    });

    expect(versions).toHaveLength(2);
    expect(second.versionId).toBe('version-2');
    const listed = await service.listVersions(ORG, 'object-1');
    expect(listed.versions).toHaveLength(2);
  });

  it('restores v1 as a new current version', async () => {
    const { service, versions } = harness();

    await service.put({
      organizationId: ORG,
      bucketId: BUCKET,
      key: 'note.txt',
      body: Readable.from([Buffer.from('v1')]),
      userId: 'user-1',
    });
    await service.put({
      organizationId: ORG,
      bucketId: BUCKET,
      key: 'note.txt',
      body: Readable.from([Buffer.from('v2')]),
      userId: 'user-1',
    });

    const restored = await service.restoreVersion(ORG, 'object-1', 'version-1', 'user-1', META);
    expect(restored.versionId).toBe('version-3');
    expect(versions.filter((version) => version.isCurrent)).toHaveLength(1);
  });

  it('creates a delete marker for the current version on a versioned bucket', async () => {
    const { service, getObject } = harness();

    await service.put({
      organizationId: ORG,
      bucketId: BUCKET,
      key: 'note.txt',
      body: Readable.from([Buffer.from('v1')]),
      userId: 'user-1',
    });

    await service.remove(ORG, 'object-1', 'user-1', META);
    expect(getObject()?.isDeleted).toBe(true);
    await expect(codeOf(() => service.get(ORG, 'object-1'))).resolves.toBe('STORAGE_OBJECT_NOT_FOUND');

    const listed = await service.listVersions(ORG, 'object-1');
    expect(listed.versions.some((version) => version.isDeleteMarker)).toBe(true);
  });

  it('hides versions from another organization', async () => {
    const { service } = harness();
    await expect(codeOf(() => service.getVersion('other-org', 'object-1', 'version-1'))).resolves.toBe(
      'STORAGE_OBJECT_NOT_FOUND',
    );
  });
});
