import {
  ChecksumAlgorithm,
  type Prisma,
  type PrismaClient,
  type StorageObject,
} from '@vaultstack/database';

export interface PublishObjectInput {
  organizationId: string;
  bucketId: string;
  storageProviderId: string;
  /** Reused when a key already exists, so overwrites keep a stable object id. */
  objectId: string;
  existingId?: string;
  key: string;
  versionId: string;
  physicalKey: string;
  size: bigint;
  contentType: string;
  etag: string;
  checksum: string | null;
  metadata?: Record<string, string>;
  isDeleteMarker?: boolean;
}

/**
 * Publishes an object version's metadata as a single atomic step.
 *
 * Physical bytes are written before this runs and cannot participate in the
 * database transaction, so callers must compensate (delete the bytes) if this
 * throws. Grouping the object row, the version row, and the current-version
 * pointer into one transaction is what prevents a half-published object.
 */
export async function publishObjectVersion(
  prisma: PrismaClient,
  input: PublishObjectInput,
): Promise<StorageObject> {
  const shared = {
    size: input.size,
    contentType: input.contentType,
    etag: input.etag,
    checksumAlgorithm: input.checksum ? ChecksumAlgorithm.SHA256 : ChecksumAlgorithm.NONE,
    checksum: input.checksum,
    physicalKey: input.physicalKey,
    ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
  };

  return prisma.$transaction(async (tx) => {
    const row = input.existingId
      ? await tx.storageObject.update({ where: { id: input.existingId }, data: shared })
      : await tx.storageObject.create({
          data: {
            id: input.objectId,
            organizationId: input.organizationId,
            bucketId: input.bucketId,
            storageProviderId: input.storageProviderId,
            key: input.key,
            ...shared,
          },
        });

    await tx.objectVersion.updateMany({
      where: { objectId: row.id, isCurrent: true },
      data: { isCurrent: false },
    });

    const version = await tx.objectVersion.create({
      data: {
        organizationId: input.organizationId,
        objectId: row.id,
        bucketId: input.bucketId,
        storageProviderId: input.storageProviderId,
        versionId: input.versionId,
        isCurrent: true,
        isDeleteMarker: input.isDeleteMarker === true,
        ...shared,
      },
    });

    return tx.storageObject.update({
      where: { id: row.id },
      data: {
        currentVersionId: version.versionId,
        isDeleted: input.isDeleteMarker === true,
      },
    });
  });
}
