import { BucketVersioningStatus, type Bucket, type PrismaClient } from '@vaultstack/database';
import type { PublicBucket } from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import { conflict, storageBucketNotEmpty, storageBucketNotFound } from '../../../lib/errors.js';
import { serializeBucket } from '../mappers/storage.mapper.js';
import { assertValidBucketName } from '../domain/object-key.js';
import { configuredPhysicalBucket } from '../domain/provider-config.js';
import type { BucketRepository } from '../repositories/bucket.repository.js';
import type { StorageService } from './storage.service.js';

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreateBucketOptions {
  name: string;
  region?: string | null;
  versioning?: 'UNVERSIONED' | 'ENABLED';
  storageProviderId?: string;
}

export interface BucketService {
  list(organizationId: string): Promise<PublicBucket[]>;
  get(organizationId: string, bucketId: string): Promise<PublicBucket>;
  getByName(organizationId: string, name: string): Promise<PublicBucket>;
  create(
    organizationId: string,
    userId: string,
    options: CreateBucketOptions,
    meta: RequestMeta,
  ): Promise<PublicBucket>;
  remove(
    organizationId: string,
    bucketId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void>;
  setVersioning(
    organizationId: string,
    bucketId: string,
    versioning: 'UNVERSIONED' | 'ENABLED' | 'SUSPENDED',
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicBucket>;
}

export function createBucketService(deps: {
  prisma: PrismaClient;
  buckets: BucketRepository;
  storage: StorageService;
}): BucketService {
  const { prisma, buckets, storage } = deps;

  return {
    async list(organizationId) {
      const rows = await buckets.listByOrganization(organizationId);
      return rows.map(serializeBucket);
    },

    async get(organizationId, bucketId) {
      const bucket = await buckets.findById(organizationId, bucketId);
      if (!bucket) {
        throw storageBucketNotFound();
      }
      return serializeBucket(bucket);
    },

    async getByName(organizationId, name) {
      const bucket = await buckets.findByName(organizationId, assertValidBucketName(name));
      if (!bucket) {
        throw storageBucketNotFound();
      }
      return serializeBucket(bucket);
    },

    async create(organizationId, userId, options, meta) {
      const name = assertValidBucketName(options.name);

      const existing = await buckets.findByName(organizationId, name);
      if (existing) {
        throw conflict('A bucket with that name already exists');
      }

      const providerRecord = options.storageProviderId
        ? await storage.findProvider(organizationId, options.storageProviderId)
        : await storage.defaultProvider(organizationId);

      // The row is created first so the physical prefix is derived from a
      // persisted id, then the physical bucket is provisioned. If provisioning
      // fails the metadata row is removed, leaving no dangling bucket.
      let bucket: Bucket;
      try {
        bucket = await buckets.create({
          organizationId,
          storageProviderId: providerRecord.id,
          name,
          region: options.region ?? null,
          physicalPrefix: '',
          versioning:
            options.versioning === 'ENABLED'
              ? BucketVersioningStatus.ENABLED
              : BucketVersioningStatus.UNVERSIONED,
        });
      } catch (error) {
        throw normalizeUniqueViolation(error);
      }

      const physicalPrefix =
        configuredPhysicalBucket(providerRecord.config) ?? storage.physicalBucketFor(bucket);

      try {
        const provider = storage.providerFor(providerRecord);
        await provider.createBucket({
          physicalBucket: physicalPrefix,
          region: options.region ?? null,
        });

        bucket = await prisma.bucket.update({
          where: { id: bucket.id },
          data: { physicalPrefix },
        });
      } catch (error) {
        await buckets.delete(organizationId, bucket.id).catch(() => undefined);
        throw error;
      }

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.bucket.created',
        resourceType: 'bucket',
        resourceId: bucket.id,
        metadata: { name: bucket.name, providerId: providerRecord.id },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeBucket(bucket);
    },

    async remove(organizationId, bucketId, userId, meta) {
      const resolved = await storage.resolveBucket(organizationId, bucketId);

      // Refuses to delete a bucket that still holds objects, so a single
      // request can never cascade into bulk data loss.
      const objectCount = await buckets.countObjects(organizationId, bucketId);
      if (objectCount > 0) {
        throw storageBucketNotEmpty();
      }

      await resolved.provider.deleteBucket({
        physicalBucket: storage.physicalBucketFor(resolved.bucket),
        region: resolved.bucket.region,
      });

      await buckets.delete(organizationId, bucketId);

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.bucket.deleted',
        resourceType: 'bucket',
        resourceId: bucketId,
        metadata: { name: resolved.bucket.name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },

    async setVersioning(organizationId, bucketId, versioning, userId, meta) {
      const bucket = await buckets.findById(organizationId, bucketId);
      if (!bucket) {
        throw storageBucketNotFound();
      }

      const next =
        versioning === 'ENABLED'
          ? BucketVersioningStatus.ENABLED
          : versioning === 'SUSPENDED'
            ? BucketVersioningStatus.SUSPENDED
            : BucketVersioningStatus.UNVERSIONED;

      const updated = await buckets.updateVersioning(organizationId, bucketId, next);

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.bucket.versioning_updated',
        resourceType: 'bucket',
        resourceId: bucketId,
        metadata: { from: bucket.versioning, to: next },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeBucket(updated);
    },
  };
}

function normalizeUniqueViolation(error: unknown): unknown {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P2002') {
    return conflict('A bucket with that name already exists');
  }
  return error;
}
