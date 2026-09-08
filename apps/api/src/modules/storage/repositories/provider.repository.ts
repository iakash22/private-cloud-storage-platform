import {
  Prisma,
  StorageProviderStatus,
  StorageProviderType,
  type PrismaClient,
  type StorageProvider as StorageProviderRow,
} from '@vaultstack/database';

export interface CreateProviderRecord {
  organizationId: string;
  name: string;
  type: StorageProviderType;
  status: StorageProviderStatus;
  isDefault: boolean;
  config: Prisma.InputJsonValue;
  credentialRef: string | null;
  accessKeyId: string | null;
  secretCiphertext: string | null;
  secretNonce: string | null;
}

export interface UpdateProviderRecord {
  name?: string;
  status?: StorageProviderStatus;
  isDefault?: boolean;
  config?: Prisma.InputJsonValue;
  credentialRef?: string | null;
  accessKeyId?: string | null;
  secretCiphertext?: string | null;
  secretNonce?: string | null;
}

/**
 * Persistence for storage provider registrations.
 *
 * Every lookup is scoped by organizationId so a provider belonging to another
 * organization can never be resolved, even with a valid provider id.
 */
export interface ProviderRepository {
  listByOrganization(organizationId: string): Promise<StorageProviderRow[]>;
  findById(organizationId: string, id: string): Promise<StorageProviderRow | null>;
  findDefault(organizationId: string): Promise<StorageProviderRow | null>;
  ensureDefault(organizationId: string, type: StorageProviderType): Promise<StorageProviderRow>;
  create(input: CreateProviderRecord): Promise<StorageProviderRow>;
  update(
    organizationId: string,
    id: string,
    input: UpdateProviderRecord,
  ): Promise<StorageProviderRow | null>;
  delete(organizationId: string, id: string): Promise<void>;
  countBuckets(organizationId: string, providerId: string): Promise<number>;
}

export function createProviderRepository(prisma: PrismaClient): ProviderRepository {
  return {
    async listByOrganization(organizationId) {
      return prisma.storageProvider.findMany({
        where: { organizationId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
    },

    async findById(organizationId, id) {
      return prisma.storageProvider.findFirst({ where: { id, organizationId } });
    },

    async findDefault(organizationId) {
      return prisma.storageProvider.findFirst({
        where: { organizationId, isDefault: true, status: StorageProviderStatus.ACTIVE },
      });
    },

    /**
     * Lazily registers the server-configured default provider for an
     * organization the first time storage is used, so no provisioning step is
     * required before the first bucket is created.
     */
    async ensureDefault(organizationId, type) {
      const existing = await prisma.storageProvider.findFirst({
        where: { organizationId, isDefault: true },
      });

      if (existing) {
        return existing;
      }

      const name = type === StorageProviderType.S3_COMPATIBLE ? 's3-compatible' : 'local';

      return prisma.storageProvider.upsert({
        where: { organizationId_name: { organizationId, name } },
        update: { isDefault: true, status: StorageProviderStatus.ACTIVE },
        create: {
          organizationId,
          name,
          type,
          isDefault: true,
          status: StorageProviderStatus.ACTIVE,
          // Credentials live in server configuration, never in this row.
          credentialRef: type === StorageProviderType.S3_COMPATIBLE ? 'env:S3' : null,
        },
      });
    },

    async create(input) {
      return prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.storageProvider.updateMany({
            where: { organizationId: input.organizationId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.storageProvider.create({ data: input });
      });
    },

    async update(organizationId, id, input) {
      return prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.storageProvider.updateMany({
            where: { organizationId, isDefault: true, NOT: { id } },
            data: { isDefault: false },
          });
        }

        const updated = await tx.storageProvider.updateMany({
          where: { id, organizationId },
          data: input,
        });

        if (updated.count === 0) {
          return null;
        }

        return tx.storageProvider.findFirstOrThrow({ where: { id, organizationId } });
      });
    },

    async delete(organizationId, id) {
      await prisma.storageProvider.deleteMany({ where: { id, organizationId } });
    },

    async countBuckets(organizationId, providerId) {
      return prisma.bucket.count({ where: { organizationId, storageProviderId: providerId } });
    },
  };
}
