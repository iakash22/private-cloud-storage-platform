import { BucketVersioningStatus, type Bucket, type PrismaClient } from '@vaultstack/database';

export interface CreateBucketRecord {
  organizationId: string;
  storageProviderId: string;
  name: string;
  region: string | null;
  physicalPrefix: string;
  versioning: BucketVersioningStatus;
}

/**
 * Persistence for buckets. Reads and writes are always constrained by
 * organizationId, which makes cross-organization access impossible at this
 * layer regardless of what a caller supplies.
 */
export interface BucketRepository {
  create(input: CreateBucketRecord): Promise<Bucket>;
  listByOrganization(organizationId: string): Promise<Bucket[]>;
  findById(organizationId: string, id: string): Promise<Bucket | null>;
  findByName(organizationId: string, name: string): Promise<Bucket | null>;
  delete(organizationId: string, id: string): Promise<void>;
  countObjects(organizationId: string, bucketId: string): Promise<number>;
}

export function createBucketRepository(prisma: PrismaClient): BucketRepository {
  return {
    async create(input) {
      return prisma.bucket.create({ data: input });
    },

    async listByOrganization(organizationId) {
      return prisma.bucket.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      });
    },

    async findById(organizationId, id) {
      return prisma.bucket.findFirst({ where: { id, organizationId } });
    },

    async findByName(organizationId, name) {
      return prisma.bucket.findFirst({ where: { organizationId, name } });
    },

    async delete(organizationId, id) {
      // deleteMany with the organization predicate keeps the guard in the
      // query itself rather than relying on a prior read.
      await prisma.bucket.deleteMany({ where: { id, organizationId } });
    },

    async countObjects(organizationId, bucketId) {
      return prisma.storageObject.count({ where: { organizationId, bucketId } });
    },
  };
}
