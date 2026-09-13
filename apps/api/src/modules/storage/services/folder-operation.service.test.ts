import { describe, expect, it, vi } from 'vitest';
import { createFolderOperationService } from './folder-operation.service.js';

const NOW = new Date('2026-09-13T00:00:00.000Z');

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    organizationId: 'org-1',
    bucketId: 'bucket-1',
    operation: 'MOVE',
    sourcePrefix: 'old/',
    destinationPrefix: 'archive/',
    status: 'QUEUED',
    processedObjects: 0,
    totalObjects: 1,
    failedObjects: 0,
    nextCursor: null,
    error: null,
    createdByUserId: 'user-1',
    createdAt: NOW,
    startedAt: null,
    completedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

function createService() {
  const prisma = {
    storageObject: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'object-1',
          key: 'old/report.pdf',
          isDeleted: false,
        },
      ]),
    },
    folderOperationJob: {
      create: vi.fn().mockResolvedValue(job()),
      findFirst: vi.fn().mockResolvedValue(job()),
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(job())
        .mockResolvedValueOnce(job({ status: 'RUNNING' })),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...job(),
        ...data,
      })),
    },
  };
  const objects = {
    move: vi.fn().mockResolvedValue({ id: 'object-1' }),
    copy: vi.fn(),
    remove: vi.fn(),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const storage = {
    limits: { maxKeyLength: 1024 },
    resolveBucket: vi.fn().mockResolvedValue({ bucket: { id: 'bucket-1' } }),
  };
  const logger = { error: vi.fn() };
  const service = createFolderOperationService({
    prisma: prisma as never,
    objects: objects as never,
    storage: storage as never,
    queue,
    logger: logger as never,
  });
  return { prisma, objects, queue, storage, service };
}

describe('FolderOperationService', () => {
  it('queues a normalized operation and records its estimate', async () => {
    const { service, queue, prisma } = createService();

    const result = await service.create({
      organizationId: 'org-1',
      bucketId: 'bucket-1',
      operation: 'MOVE',
      sourcePrefix: 'old',
      destinationPrefix: 'archive',
      userId: 'user-1',
      meta: {},
    });

    expect(prisma.folderOperationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourcePrefix: 'old/',
          destinationPrefix: 'archive/',
          totalObjects: 1,
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith('job-1');
    expect(result.status).toBe('QUEUED');
  });

  it('resumes a move page and marks the job complete', async () => {
    const { service, objects, prisma } = createService();

    await service.process('job-1');

    expect(objects.move).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: 'object-1',
        destinationKey: 'archive/report.pdf',
      }),
    );
    expect(prisma.folderOperationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
});
