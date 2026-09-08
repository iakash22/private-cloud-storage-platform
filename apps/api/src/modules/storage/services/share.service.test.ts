import { hashPassword, hashToken } from '@vaultstack/auth';
import { ShareVisibility } from '@vaultstack/database';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/errors.js';
import { createStorageTokenService } from './storage-token.service.js';
import { ShareService } from './share.service.js';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const OBJECT_ID = 'obj-1';
const META = { ipAddress: null, userAgent: null };
const ACTOR = {
  user: { id: 'user-1', email: 'owner@example.com', name: 'Owner' },
  organizationIds: [ORG],
  method: 'session' as const,
};

const LIVE_OBJECT = {
  id: OBJECT_ID,
  key: 'docs/secret.txt',
  size: 12n,
  contentType: 'text/plain',
};

function future(ms = 60_000): Date {
  return new Date(Date.now() + ms);
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('Expected rejection');
}

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'share-1',
    organizationId: ORG,
    objectId: OBJECT_ID,
    createdByUserId: ACTOR.user.id,
    teamId: null,
    tokenHash: 'hashed',
    tokenPrefix: 'vs_sh_abcd',
    visibility: ShareVisibility.PUBLIC_LINK,
    passwordHash: null,
    allowView: true,
    allowDownload: true,
    maxDownloads: null,
    expiresAt: future(),
    revokedAt: null,
    lastAccessAt: null,
    accessCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    object: { ...LIVE_OBJECT, isDeleted: false },
    ...overrides,
  };
}

describe('ShareService', () => {
  it('creates a public-link share and returns the plaintext token once', async () => {
    const created = shareRow();
    const prisma = {
      storageObject: {
        findFirst: vi.fn(async () => LIVE_OBJECT),
      },
      shareLink: {
        create: vi.fn(async ({ data }: { data: { tokenHash: string; tokenPrefix: string } }) => ({
          ...created,
          tokenHash: data.tokenHash,
          tokenPrefix: data.tokenPrefix,
        })),
      },
      auditLog: { create: vi.fn(async () => ({})) },
      user: { findUnique: vi.fn(async () => ({ id: ACTOR.user.id })) },
    };
    const service = new ShareService(
      prisma as never,
      createStorageTokenService('share-test-secret-value-32chars!!'),
      'test',
    );

    const result = await service.create(
      ORG,
      OBJECT_ID,
      { visibility: 'PUBLIC_LINK' },
      ACTOR.user.id,
      META,
    );

    expect(result.token.startsWith('vs_sh_')).toBe(true);
    expect(result.fileName).toBe('secret.txt');
    expect(result).not.toHaveProperty('physicalKey');
    const createMock = prisma.shareLink.create.mock.calls[0]?.[0] as {
      data: { tokenHash: string };
    };
    expect(createMock.data.tokenHash).toBe(hashToken(result.token));
    expect(createMock.data.tokenHash).not.toBe(result.token);
  });

  it('refuses to share an object from another organization', async () => {
    const prisma = {
      storageObject: { findFirst: vi.fn(async () => null) },
    };
    const service = new ShareService(
      prisma as never,
      createStorageTokenService('share-test-secret-value-32chars!!'),
      'test',
    );

    expect(
      await codeOf(() =>
        service.create(OTHER_ORG, OBJECT_ID, { visibility: 'PUBLIC_LINK' }, ACTOR.user.id, META),
      ),
    ).toBe('STORAGE_OBJECT_NOT_FOUND');
  });

  it('rejects expired, revoked, deleted, wrong-password, and limited downloads', async () => {
    const passwordHash = await hashPassword('correct-password', 'test');
    const tokens = createStorageTokenService('share-test-secret-value-32chars!!');
    const rows = {
      expired: shareRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
      revoked: shareRow({ revokedAt: new Date() }),
      deleted: shareRow({ object: { ...LIVE_OBJECT, isDeleted: true } }),
      password: shareRow({ passwordHash }),
      limited: shareRow({ maxDownloads: 1, accessCount: 1 }),
    };

    const prisma = {
      shareLink: {
        findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
          if (where.tokenHash === hashToken('expired-token')) {
            return rows.expired;
          }
          if (where.tokenHash === hashToken('revoked-token')) {
            return rows.revoked;
          }
          if (where.tokenHash === hashToken('deleted-token')) {
            return rows.deleted;
          }
          if (where.tokenHash === hashToken('password-token')) {
            return rows.password;
          }
          if (where.tokenHash === hashToken('limited-token')) {
            return rows.limited;
          }
          return null;
        }),
        $executeRaw: undefined,
      },
      $executeRaw: vi.fn(),
    };
    const service = new ShareService(prisma as never, tokens, 'test');

    expect(await codeOf(() => service.inspect('expired-token', undefined))).toBe(
      'SHARE_LINK_EXPIRED',
    );
    expect(await codeOf(() => service.inspect('revoked-token', undefined))).toBe(
      'SHARE_LINK_REVOKED',
    );
    expect(await codeOf(() => service.inspect('deleted-token', undefined))).toBe(
      'STORAGE_OBJECT_NOT_FOUND',
    );
    expect(await codeOf(() => service.unlock('password-token', 'wrong-password', undefined))).toBe(
      'SHARE_PASSWORD_INVALID',
    );
    expect(
      await codeOf(() =>
        service.createDownloadUrl('limited-token', undefined, {}, 'http://127.0.0.1:3000'),
      ),
    ).toBe('SHARE_DOWNLOAD_LIMIT_REACHED');
  });

  it('issues a short-lived VaultStack download URL without provider credentials', async () => {
    const tokens = createStorageTokenService('share-test-secret-value-32chars!!');
    const prisma = {
      shareLink: {
        findUnique: vi.fn(async () => shareRow()),
      },
      $executeRaw: vi.fn(async () => 1),
    };
    const service = new ShareService(prisma as never, tokens, 'test');

    const download = await service.createDownloadUrl(
      'valid-token',
      undefined,
      {},
      'http://127.0.0.1:3000',
    );

    expect(download.method).toBe('GET');
    expect(download.url).toContain('/api/v1/storage/objects/obj-1/content?token=');
    expect(download.url).not.toContain('physicalKey');
    expect(download.url).not.toContain('AKIA');
    expect(download.url).not.toContain('/docs/secret.txt');
  });
});
