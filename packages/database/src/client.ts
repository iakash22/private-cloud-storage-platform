import { PrismaClient } from '@prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

export { PrismaClient, Prisma } from '@prisma/client';

// Storage enums are re-exported as values so the API can reference them
// without importing @prisma/client directly.
export {
  BucketVersioningStatus,
  ChecksumAlgorithm,
  MultipartUploadStatus,
  StorageLifecycleAction,
  StoragePolicyEffect,
  StoragePolicyKind,
  StorageProviderStatus,
  StorageProviderType,
  UploadStatus,
} from '@prisma/client';
