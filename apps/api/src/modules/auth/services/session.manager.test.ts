import { describe, expect, it, vi } from 'vitest';
import { SessionManager } from './session.manager.js';

function createPrismaMock() {
  return {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('SessionManager', () => {
  it('lists only active unexpired sessions for a user', async () => {
    const prisma = createPrismaMock();
    prisma.session.findMany.mockResolvedValue([
      {
        id: 's1',
        userId: 'u1',
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        ipAddress: '1.2.3.4',
        userAgent: 'Chrome',
      },
    ]);
    const manager = new SessionManager(prisma as never, 'secret', 3600);
    const rows = await manager.listActiveByUser('u1');
    expect(rows).toHaveLength(1);
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          revokedAt: null,
        }),
      }),
    );
  });

  it('revokes only owned sessions', async () => {
    const prisma = createPrismaMock();
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    const manager = new SessionManager(prisma as never, 'secret', 3600);
    await expect(manager.revokeOwned('u1', 's1')).resolves.toBe(true);
    prisma.session.updateMany.mockResolvedValue({ count: 0 });
    await expect(manager.revokeOwned('u1', 'missing')).resolves.toBe(false);
  });

  it('revokes other sessions except current', async () => {
    const prisma = createPrismaMock();
    prisma.session.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    prisma.session.updateMany.mockResolvedValue({ count: 2 });
    const manager = new SessionManager(prisma as never, 'secret', 3600);
    await expect(manager.revokeOthers('u1', 'current')).resolves.toEqual({
      count: 2,
      revokedSessionIds: ['s1', 's2'],
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          id: { not: 'current' },
        }),
      }),
    );
  });
});
