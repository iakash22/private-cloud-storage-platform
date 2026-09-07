import {
  MultipartUploadStatus,
  UploadStatus,
  type MultipartPart,
  type MultipartUpload,
  type PrismaClient,
  type Upload,
} from '@vaultstack/database';

export interface CreateUploadRecord {
  organizationId: string;
  bucketId: string;
  userId: string | null;
  key: string;
  contentType: string | null;
  declaredSize: bigint | null;
  tokenHash: string;
  stagingKey: string;
  providerUploadId: string | null;
  expiresAt: Date;
}

export interface CreateMultipartRecord {
  organizationId: string;
  bucketId: string;
  storageProviderId: string;
  userId: string | null;
  key: string;
  contentType: string | null;
  declaredSize: bigint | null;
  providerUploadId: string;
  stagingKey: string;
  expiresAt: Date;
}

export type MultipartUploadWithParts = MultipartUpload & { parts: MultipartPart[] };

/** Persistence for single-shot uploads and multipart upload sessions. */
export interface UploadRepository {
  create(input: CreateUploadRecord): Promise<Upload>;
  findById(organizationId: string, id: string): Promise<Upload | null>;
  findByTokenHash(tokenHash: string): Promise<Upload | null>;
  setStatus(id: string, status: UploadStatus, failureCode?: string): Promise<Upload>;
  markCompleted(
    id: string,
    objectId: string,
    receivedSize: bigint,
    checksum: string,
  ): Promise<Upload>;
  expireStale(now: Date): Promise<number>;

  createMultipart(input: CreateMultipartRecord): Promise<MultipartUpload>;
  findMultipartById(organizationId: string, id: string): Promise<MultipartUpload | null>;
  findMultipartWithParts(
    organizationId: string,
    id: string,
  ): Promise<MultipartUploadWithParts | null>;
  findMultipartByProviderUploadId(
    organizationId: string,
    bucketId: string,
    providerUploadId: string,
  ): Promise<MultipartUpload | null>;
  setMultipartStatus(
    organizationId: string,
    id: string,
    status: MultipartUploadStatus,
    failureCode?: string | null,
  ): Promise<MultipartUpload>;
  touchMultipart(organizationId: string, id: string): Promise<MultipartUpload>;
  markMultipartCompleted(organizationId: string, id: string): Promise<MultipartUpload>;
  upsertPart(input: {
    multipartUploadId: string;
    partNumber: number;
    size: bigint;
    etag: string;
    checksum: string | null;
  }): Promise<MultipartPart>;
  listParts(organizationId: string, multipartUploadId: string): Promise<MultipartPart[]>;
  deleteMultipart(id: string): Promise<void>;
  findStaleUploads(now: Date): Promise<Upload[]>;
  findStaleMultipart(now: Date): Promise<MultipartUpload[]>;
}

export function createUploadRepository(prisma: PrismaClient): UploadRepository {
  return {
    async create(input) {
      return prisma.upload.create({ data: input });
    },

    async findById(organizationId, id) {
      return prisma.upload.findFirst({ where: { id, organizationId } });
    },

    async findByTokenHash(tokenHash) {
      return prisma.upload.findUnique({ where: { tokenHash } });
    },

    async setStatus(id, status, failureCode) {
      return prisma.upload.update({
        where: { id },
        data: { status, ...(failureCode ? { failureCode } : {}) },
      });
    },

    async markCompleted(id, objectId, receivedSize, checksum) {
      return prisma.upload.update({
        where: { id },
        data: {
          status: UploadStatus.COMPLETED,
          objectId,
          receivedSize,
          checksum,
          completedAt: new Date(),
        },
      });
    },

    async expireStale(now) {
      const result = await prisma.upload.updateMany({
        where: {
          expiresAt: { lt: now },
          status: { in: [UploadStatus.PENDING, UploadStatus.UPLOADING] },
        },
        data: { status: UploadStatus.EXPIRED },
      });

      return result.count;
    },

    async createMultipart(input) {
      return prisma.multipartUpload.create({ data: input });
    },

    async findMultipartById(organizationId, id) {
      return prisma.multipartUpload.findFirst({ where: { id, organizationId } });
    },

    async findMultipartWithParts(organizationId, id) {
      return prisma.multipartUpload.findFirst({
        where: { id, organizationId },
        include: { parts: { orderBy: { partNumber: 'asc' } } },
      });
    },

    async findMultipartByProviderUploadId(organizationId, bucketId, providerUploadId) {
      return prisma.multipartUpload.findFirst({
        where: { organizationId, bucketId, providerUploadId },
      });
    },

    async setMultipartStatus(organizationId, id, status, failureCode) {
      return prisma.multipartUpload.update({
        where: { id, organizationId },
        data: {
          status,
          lastActivityAt: new Date(),
          ...(failureCode !== undefined ? { failureCode } : {}),
        },
      });
    },

    async touchMultipart(organizationId, id) {
      return prisma.multipartUpload.update({
        where: { id, organizationId },
        data: { lastActivityAt: new Date() },
      });
    },

    async markMultipartCompleted(organizationId, id) {
      return prisma.multipartUpload.update({
        where: { id, organizationId },
        data: {
          status: MultipartUploadStatus.COMPLETED,
          completedAt: new Date(),
          failureCode: null,
          lastActivityAt: new Date(),
        },
      });
    },

    async upsertPart(input) {
      return prisma.multipartPart.upsert({
        where: {
          multipartUploadId_partNumber: {
            multipartUploadId: input.multipartUploadId,
            partNumber: input.partNumber,
          },
        },
        update: { size: input.size, etag: input.etag, checksum: input.checksum },
        create: input,
      });
    },

    async listParts(organizationId, multipartUploadId) {
      return prisma.multipartPart.findMany({
        where: { multipartUploadId, multipartUpload: { organizationId } },
        orderBy: { partNumber: 'asc' },
      });
    },

    async deleteMultipart(id) {
      await prisma.multipartUpload.delete({ where: { id } });
    },

    async findStaleUploads(now) {
      return prisma.upload.findMany({
        where: {
          expiresAt: { lt: now },
          status: { in: [UploadStatus.PENDING, UploadStatus.UPLOADING] },
        },
        take: 100,
      });
    },

    async findStaleMultipart(now) {
      return prisma.multipartUpload.findMany({
        where: {
          expiresAt: { lt: now },
          status: {
            in: [
              MultipartUploadStatus.INITIATED,
              MultipartUploadStatus.UPLOADING,
              MultipartUploadStatus.COMPLETING,
            ],
          },
        },
        take: 100,
      });
    },
  };
}
