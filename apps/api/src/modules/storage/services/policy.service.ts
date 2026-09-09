import {
  MultipartUploadStatus,
  UploadStatus,
  type PrismaClient,
} from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { PublicStoragePolicy, StorageLifecycleActionName } from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import { conflict, dependencyError, notFound } from '../../../lib/errors.js';
import {
  evaluateLifecyclePolicies,
  type LifecyclePolicyRule,
} from '../domain/lifecycle.js';
import { serializeStoragePolicy } from '../mappers/storage.mapper.js';
import type { PolicyRepository } from '../repositories/policy.repository.js';
import type { RequestMeta } from './bucket.service.js';
import type { ObjectService } from './object.service.js';
import type { StorageService } from './storage.service.js';
import type { UploadService } from './upload.service.js';

export interface CreateLifecyclePolicyInput {
  name: string;
  bucketId?: string;
  keyPrefix?: string;
  days: number;
  lifecycleAction: StorageLifecycleActionName;
  enabled?: boolean;
}

export interface LifecycleApplyResult {
  expiredCurrent: number;
  expiredNoncurrent: number;
  abortedMultipart: number;
  expiredTemporary: number;
}

export interface PolicyService {
  list(organizationId: string, bucketId?: string): Promise<PublicStoragePolicy[]>;
  get(organizationId: string, policyId: string): Promise<PublicStoragePolicy>;
  createLifecycle(
    organizationId: string,
    userId: string,
    input: CreateLifecyclePolicyInput,
    meta: RequestMeta,
  ): Promise<PublicStoragePolicy>;
  update(
    organizationId: string,
    policyId: string,
    userId: string,
    input: Omit<Partial<CreateLifecyclePolicyInput>, 'keyPrefix'> & {
      enabled?: boolean;
      keyPrefix?: string | null;
    },
    meta: RequestMeta,
  ): Promise<PublicStoragePolicy>;
  remove(
    organizationId: string,
    policyId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void>;
  applyDuePolicies(): Promise<LifecycleApplyResult>;
}

const CANDIDATE_LIMIT = 500;

export function createPolicyService(deps: {
  prisma: PrismaClient;
  policies: PolicyRepository;
  storage: StorageService;
  objects: ObjectService;
  uploads: UploadService;
  logger: Logger;
}): PolicyService {
  const { prisma, policies, storage, objects, uploads, logger } = deps;

  return {
    async list(organizationId, bucketId) {
      const rows = await policies.list(organizationId, bucketId);
      return rows.map(serializeStoragePolicy);
    },

    async get(organizationId, policyId) {
      const row = await policies.findById(organizationId, policyId);
      if (!row) {
        throw notFound('Storage policy not found');
      }
      return serializeStoragePolicy(row);
    },

    async createLifecycle(organizationId, userId, input, meta) {
      if (input.bucketId) {
        await storage.resolveBucket(organizationId, input.bucketId).catch(() => {
          throw dependencyError('Bucket not found', {
            bucketId: 'Bucket not found',
          });
        });
      }

      let row;
      try {
        row = await policies.createLifecycle({
          organizationId,
          bucketId: input.bucketId ?? null,
          name: input.name,
          days: input.days,
          lifecycleAction: input.lifecycleAction,
          keyPrefix: input.keyPrefix ?? null,
          enabled: input.enabled ?? true,
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw conflict('A storage policy with that name already exists', {
            name: 'A storage policy with that name already exists',
          });
        }
        throw error;
      }

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.policy.created',
        resourceType: 'storage_policy',
        resourceId: row.id,
        metadata: { lifecycleAction: input.lifecycleAction, days: input.days },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeStoragePolicy(row);
    },

    async update(organizationId, policyId, userId, input, meta) {
      const existing = await policies.findById(organizationId, policyId);
      if (!existing) {
        throw notFound('Storage policy not found');
      }

      const row = await policies.update(organizationId, policyId, {
        ...(input.name ? { name: input.name } : {}),
        ...(input.keyPrefix !== undefined ? { keyPrefix: input.keyPrefix } : {}),
        ...(input.days !== undefined ? { days: input.days } : {}),
        ...(input.lifecycleAction
          ? { lifecycleAction: input.lifecycleAction }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.policy.updated',
        resourceType: 'storage_policy',
        resourceId: row.id,
        metadata: {},
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeStoragePolicy(row);
    },

    async remove(organizationId, policyId, userId, meta) {
      const existing = await policies.findById(organizationId, policyId);
      if (!existing) {
        throw notFound('Storage policy not found');
      }

      await policies.delete(organizationId, policyId);

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.policy.deleted',
        resourceType: 'storage_policy',
        resourceId: policyId,
        metadata: { name: existing.name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },

    async applyDuePolicies() {
      const result: LifecycleApplyResult = {
        expiredCurrent: 0,
        expiredNoncurrent: 0,
        abortedMultipart: 0,
        expiredTemporary: 0,
      };

      const rows = await policies.listEnabledLifecycle();
      const rules: LifecyclePolicyRule[] = rows.flatMap((row) => {
        if (row.days === null || row.lifecycleAction === null) {
          return [];
        }
        return [
          {
            id: row.id,
            organizationId: row.organizationId,
            bucketId: row.bucketId,
            keyPrefix: row.keyPrefix,
            days: row.days,
            lifecycleAction: row.lifecycleAction,
          },
        ];
      });

      if (rules.length === 0) {
        return result;
      }

      const now = new Date();
      const organizationIds = [...new Set(rules.map((rule) => rule.organizationId))];

      const objectRows = await prisma.storageObject.findMany({
        where: { organizationId: { in: organizationIds } },
        include: { versions: { where: { isCurrent: true }, take: 1 } },
        take: CANDIDATE_LIMIT,
      });
      const versionRows = await prisma.objectVersion.findMany({
        where: { organizationId: { in: organizationIds }, isCurrent: false },
        include: { object: { select: { key: true } } },
        take: CANDIDATE_LIMIT,
      });
      const uploadRows = await prisma.upload.findMany({
        where: {
          organizationId: { in: organizationIds },
          status: { in: [UploadStatus.PENDING, UploadStatus.UPLOADING] },
        },
        take: CANDIDATE_LIMIT,
      });
      const multipartRows = await prisma.multipartUpload.findMany({
        where: {
          organizationId: { in: organizationIds },
          status: {
            in: [
              MultipartUploadStatus.INITIATED,
              MultipartUploadStatus.UPLOADING,
              MultipartUploadStatus.COMPLETING,
            ],
          },
        },
        take: CANDIDATE_LIMIT,
      });

      const decisions = evaluateLifecyclePolicies({
        now,
        rules,
        objects: objectRows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          bucketId: row.bucketId,
          key: row.key,
          isDeleted: row.isDeleted,
          currentCreatedAt: row.versions[0]?.createdAt ?? row.createdAt,
        })),
        versions: versionRows.map((row) => ({
          objectId: row.objectId,
          organizationId: row.organizationId,
          bucketId: row.bucketId,
          key: row.object.key,
          versionId: row.versionId,
          isCurrent: row.isCurrent,
          isDeleteMarker: row.isDeleteMarker,
          createdAt: row.createdAt,
        })),
        uploads: uploadRows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          bucketId: row.bucketId,
          key: row.key,
          createdAt: row.createdAt,
        })),
        multiparts: multipartRows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          bucketId: row.bucketId,
          key: row.key,
          lastActivityAt: row.lastActivityAt,
        })),
      });

      const meta = { ipAddress: null, userAgent: null };

      for (const decision of decisions) {
        try {
          if (decision.type === 'expire-current') {
            await objects.remove(decision.organizationId, decision.objectId, 'system', meta);
            result.expiredCurrent += 1;
          } else if (decision.type === 'expire-noncurrent') {
            await objects.remove(
              decision.organizationId,
              decision.objectId,
              'system',
              meta,
              decision.versionId,
            );
            result.expiredNoncurrent += 1;
          } else if (decision.type === 'expire-temporary') {
            await uploads.abort({
              organizationId: decision.organizationId,
              uploadId: decision.uploadId,
              userId: 'system',
              meta,
            });
            result.expiredTemporary += 1;
          } else {
            const session = await prisma.multipartUpload.findFirst({
              where: {
                id: decision.multipartUploadId,
                organizationId: decision.organizationId,
              },
              select: { userId: true },
            });
            await uploads.abortMultipart({
              organizationId: decision.organizationId,
              uploadId: decision.multipartUploadId,
              userId: session?.userId ?? 'system',
              meta,
            });
            result.abortedMultipart += 1;
          }
        } catch (error) {
          logger.warn(
            {
              event: 'storage.lifecycle.apply_failed',
              policyId: decision.policyId,
              reason: error instanceof Error ? error.name : 'unknown',
            },
            'Lifecycle decision could not be applied',
          );
        }
      }

      if (
        result.expiredCurrent +
          result.expiredNoncurrent +
          result.abortedMultipart +
          result.expiredTemporary >
        0
      ) {
        logger.info({ event: 'storage.lifecycle.applied', ...result }, 'Lifecycle policies applied');
      }

      return result;
    },
  };
}
