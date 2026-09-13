import { describe, expect, it, vi } from 'vitest';
import { createFolderAccessService } from './folder-access.service.js';

describe('FolderAccessService', () => {
  it('normalizes team folder prefixes and returns a collaboration rule', async () => {
    const row = {
      id: 'rule-1',
      organizationId: 'org-1',
      bucketId: 'bucket-1',
      prefix: 'projects/acme/',
      role: 'EDITOR',
      userId: null,
      teamId: 'team-1',
      createdByUserId: 'user-1',
      createdAt: new Date('2026-09-13T00:00:00.000Z'),
      updatedAt: new Date('2026-09-13T00:00:00.000Z'),
      team: { name: 'Engineering' },
      user: null,
    };
    const prisma = {
      folderAccessRule: { create: vi.fn().mockResolvedValue(row) },
      team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-1' }) },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const service = createFolderAccessService({
      prisma: prisma as never,
      storage: {
        limits: { maxKeyLength: 1024 },
        resolveBucket: vi.fn().mockResolvedValue({}),
      } as never,
      logger: { error: vi.fn() } as never,
    });

    const result = await service.create({
      organizationId: 'org-1',
      bucketId: 'bucket-1',
      prefix: 'projects/acme',
      role: 'EDITOR',
      teamId: 'team-1',
      actorUserId: 'user-1',
      meta: {},
    });

    expect(prisma.folderAccessRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ prefix: 'projects/acme/' }),
      }),
    );
    expect(result.subjectName).toBe('Engineering');
  });
});
