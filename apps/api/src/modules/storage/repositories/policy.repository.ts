import {
  StorageLifecycleAction,
  StoragePolicyKind,
  type PrismaClient,
  type StoragePolicy,
} from '@vaultstack/database';

export interface CreateLifecyclePolicyRecord {
  organizationId: string;
  bucketId: string | null;
  name: string;
  days: number;
  lifecycleAction: StorageLifecycleAction;
  keyPrefix: string | null;
  enabled: boolean;
}

export interface PolicyRepository {
  createLifecycle(input: CreateLifecyclePolicyRecord): Promise<StoragePolicy>;
  list(organizationId: string, bucketId?: string): Promise<StoragePolicy[]>;
  findById(organizationId: string, id: string): Promise<StoragePolicy | null>;
  update(
    organizationId: string,
    id: string,
    data: Partial<{
      name: string;
      keyPrefix: string | null;
      days: number;
      lifecycleAction: StorageLifecycleAction;
      enabled: boolean;
    }>,
  ): Promise<StoragePolicy>;
  delete(organizationId: string, id: string): Promise<void>;
  listEnabledLifecycle(): Promise<StoragePolicy[]>;
}

export function createPolicyRepository(prisma: PrismaClient): PolicyRepository {
  return {
    async createLifecycle(input) {
      return prisma.storagePolicy.create({
        data: {
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          name: input.name,
          kind: StoragePolicyKind.LIFECYCLE,
          enabled: input.enabled,
          days: input.days,
          lifecycleAction: input.lifecycleAction,
          keyPrefix: input.keyPrefix,
          actions: [],
        },
      });
    },

    async list(organizationId, bucketId) {
      return prisma.storagePolicy.findMany({
        where: {
          organizationId,
          ...(bucketId ? { OR: [{ bucketId }, { bucketId: null }] } : {}),
        },
        orderBy: { name: 'asc' },
      });
    },

    async findById(organizationId, id) {
      return prisma.storagePolicy.findFirst({ where: { id, organizationId } });
    },

    async update(organizationId, id, data) {
      const existing = await prisma.storagePolicy.findFirst({ where: { id, organizationId } });
      if (!existing) {
        throw new Error('Storage policy not found');
      }
      return prisma.storagePolicy.update({
        where: { id },
        data,
      });
    },

    async delete(organizationId, id) {
      await prisma.storagePolicy.deleteMany({ where: { id, organizationId } });
    },

    async listEnabledLifecycle() {
      return prisma.storagePolicy.findMany({
        where: {
          kind: StoragePolicyKind.LIFECYCLE,
          enabled: true,
          days: { not: null },
          lifecycleAction: { not: null },
        },
      });
    },
  };
}
