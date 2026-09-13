import { describe, expect, it, vi } from 'vitest';
import { createFolderAuthorizationService } from './folder-authorization.service.js';

describe('FolderAuthorizationService', () => {
  it('uses the deepest matching prefix and team membership', async () => {
    const prisma = {
      folderAccessRule: {
        findMany: vi.fn().mockResolvedValue([
          { prefix: 'projects/', role: 'VIEWER', userId: null, teamId: 'team-1' },
          { prefix: 'projects/secret/', role: 'EDITOR', userId: null, teamId: 'team-2' },
        ]),
      },
      teamMember: {
        findMany: vi.fn().mockResolvedValue([{ teamId: 'team-2' }]),
      },
    };
    const service = createFolderAuthorizationService(prisma as never);

    await expect(
      service.assert({
        organizationId: 'org-1',
        bucketId: 'bucket-1',
        key: 'projects/secret/report.pdf',
        userId: 'user-1',
        action: 'WRITE',
      }),
    ).resolves.toBeUndefined();

    expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      }),
    );
  });

  it('denies users without a subject at the deepest matching prefix', async () => {
    const prisma = {
      folderAccessRule: {
        findMany: vi.fn().mockResolvedValue([
          { prefix: 'restricted/', role: 'VIEWER', userId: 'other-user', teamId: null },
        ]),
      },
      teamMember: { findMany: vi.fn() },
    };
    const service = createFolderAuthorizationService(prisma as never);

    await expect(
      service.assert({
        organizationId: 'org-1',
        bucketId: 'bucket-1',
        key: 'restricted/file.txt',
        userId: 'user-1',
        action: 'READ',
      }),
    ).rejects.toThrow('You do not have access to this folder');
  });
});
