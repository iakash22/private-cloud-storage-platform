import type { BucketVersioningStatus, ObjectVersion, PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { StorageProvider } from '../domain/storage-provider.js';
import type { StorageLocation } from '../domain/storage.types.js';
import {
  discardsAllNonCurrentOnPut,
  replacesCurrentVersionOnPut,
  retainsVersionHistory,
} from '../domain/versioning.js';

export async function reclaimSupersededVersions(input: {
  prisma: PrismaClient;
  provider: StorageProvider;
  locationFor: (physicalKey: string) => StorageLocation;
  organizationId: string;
  objectId: string;
  versioning: BucketVersioningStatus;
  logger: Logger;
}): Promise<void> {
  if (retainsVersionHistory(input.versioning)) {
    return;
  }

  const versions = await input.prisma.objectVersion.findMany({
    where: { organizationId: input.organizationId, objectId: input.objectId, isCurrent: false },
    orderBy: { createdAt: 'desc' },
  });

  const toRemove = discardsAllNonCurrentOnPut(input.versioning)
    ? versions
    : replacesCurrentVersionOnPut(input.versioning)
      ? versions.slice(0, 1)
      : versions;

  for (const version of toRemove) {
    await deleteVersionBytes(input, version);
    await input.prisma.objectVersion.deleteMany({
      where: {
        organizationId: input.organizationId,
        objectId: input.objectId,
        versionId: version.versionId,
      },
    });
  }
}

export async function deleteVersionBytes(
  input: {
    provider: StorageProvider;
    locationFor: (physicalKey: string) => StorageLocation;
    logger: Logger;
    objectId: string;
  },
  version: Pick<ObjectVersion, 'physicalKey' | 'isDeleteMarker' | 'versionId'>,
): Promise<void> {
  if (version.isDeleteMarker || version.physicalKey.length === 0) {
    return;
  }

  await input.provider.deleteObject(input.locationFor(version.physicalKey)).catch((error: unknown) => {
    input.logger.warn(
      {
        event: 'storage.object.orphaned_bytes',
        objectId: input.objectId,
        reason: error instanceof Error ? error.name : 'unknown',
      },
      'Version bytes could not be removed',
    );
  });
}
