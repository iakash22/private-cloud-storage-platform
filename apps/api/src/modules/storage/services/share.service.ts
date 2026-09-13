import { PasswordService, ShareTokenService } from '@vaultstack/auth';
import type { PrismaClient, ShareLink } from '@vaultstack/database';
import { ShareVisibility } from '@vaultstack/database';
import type {
  CreatedShareLink,
  PublicPresignedUrl,
  PublicShareAccess,
  PublicShareInspect,
  PublicShareLink,
  ShareVisibilityName,
} from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import {
  shareAccessDenied,
  shareDownloadLimitReached as shareDownloadLimitError,
  shareLinkExpired,
  shareLinkNotFound,
  shareLinkRevoked,
  sharePasswordInvalid,
  sharePasswordRequired,
  storageObjectNotFound,
  unauthorized,
  validationError,
  dependencyError,
} from '../../../lib/errors.js';
import type { AuthContext } from '../../auth/auth.types.js';
import {
  DEFAULT_SHARE_TTL_MS,
  MAX_SHARE_TTL_MS,
  SHARE_ACCESS_TTL_SECONDS,
  SHARE_DOWNLOAD_TTL_SECONDS,
  shareDownloadLimitReached,
  shareIsExpired,
  shareIsRevoked,
} from '../domain/share-access.js';
import {
  serializeCreatedShareLink,
  serializeShareAccess,
  serializeShareLink,
  type ShareLinkRecord,
} from '../mappers/share.mapper.js';
import type { RequestMeta } from './bucket.service.js';
import type { StorageTokenService } from './storage-token.service.js';

const SHARE_INCLUDE = {
  object: { select: { key: true, size: true, contentType: true, isDeleted: true } },
} as const;

type ShareRow = ShareLink & {
  object: { key: string; size: bigint; contentType: string; isDeleted: boolean };
};

export interface CreateShareInput {
  visibility: ShareVisibilityName;
  teamId?: string;
  password?: string;
  allowView?: boolean;
  allowDownload?: boolean;
  maxDownloads?: number;
  expiresAt?: string;
}

export interface UpdateShareInput {
  expiresAt?: string | null;
  allowView?: boolean;
  allowDownload?: boolean;
  maxDownloads?: number | null;
  revoked?: true;
}

export class ShareService {
  private readonly tokens = new ShareTokenService();
  private readonly passwords: PasswordService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageTokens: StorageTokenService,
    nodeEnv: string,
  ) {
    this.passwords = new PasswordService(nodeEnv);
  }

  async create(
    organizationId: string,
    objectId: string,
    input: CreateShareInput,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<CreatedShareLink> {
    const object = await this.prisma.storageObject.findFirst({
      where: { id: objectId, organizationId, isDeleted: false },
      select: { id: true, key: true, size: true, contentType: true },
    });
    if (!object) {
      throw storageObjectNotFound();
    }

    if (input.visibility === 'TEAM') {
      const team = await this.prisma.team.findFirst({
        where: { id: input.teamId, organizationId },
      });
      if (!team) {
        throw dependencyError('Team not found in this organization', {
          teamId: 'Team not found in this organization',
        });
      }
    }

    const expiresAt = this.parseExpiresAt(input.expiresAt);
    const issued = this.tokens.generate();
    const allowView = input.allowView ?? true;
    const allowDownload = input.allowDownload ?? true;

    const share = await this.prisma.shareLink.create({
      data: {
        organizationId,
        objectId: object.id,
        createdByUserId: actorUserId,
        teamId: input.visibility === 'TEAM' ? input.teamId : null,
        tokenHash: issued.hash,
        tokenPrefix: issued.prefix,
        visibility: ShareVisibility[input.visibility],
        passwordHash: input.password ? await this.passwords.hash(input.password) : null,
        allowView,
        allowDownload,
        maxDownloads: input.maxDownloads ?? null,
        expiresAt,
      },
      include: SHARE_INCLUDE,
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 'share.created',
      resourceType: 'share',
      resourceId: share.id,
      metadata: { visibility: input.visibility, objectId, hasPassword: Boolean(input.password) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeCreatedShareLink(this.toRecord(share), issued.plaintext);
  }

  async list(organizationId: string, objectId?: string): Promise<PublicShareLink[]> {
    const shares = await this.prisma.shareLink.findMany({
      where: { organizationId, ...(objectId ? { objectId } : {}) },
      include: SHARE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return shares.map((share) => serializeShareLink(this.toRecord(share)));
  }

  async get(organizationId: string, shareId: string): Promise<PublicShareLink> {
    return serializeShareLink(this.toRecord(await this.requireOwnedShare(organizationId, shareId)));
  }

  async update(
    organizationId: string,
    shareId: string,
    input: UpdateShareInput,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<PublicShareLink> {
    const existing = await this.requireOwnedShare(organizationId, shareId);
    const allowView = input.allowView ?? existing.allowView;
    const allowDownload = input.allowDownload ?? existing.allowDownload;
    if (!allowView && !allowDownload) {
      throw validationError('A share must allow viewing or downloading', {
        allowView: 'A share must allow viewing or downloading',
        allowDownload: 'A share must allow viewing or downloading',
      });
    }

    let expiresAt = existing.expiresAt;
    if (input.expiresAt !== undefined) {
      expiresAt = input.expiresAt === null ? null : this.parseExpiresAt(input.expiresAt);
    }

    if (
      input.maxDownloads !== undefined &&
      input.maxDownloads !== null &&
      input.maxDownloads < existing.accessCount
    ) {
      throw validationError('maxDownloads cannot be below the current access count', {
        maxDownloads: 'maxDownloads cannot be below the current access count',
      });
    }

    const share = await this.prisma.shareLink.update({
      where: { id: existing.id },
      data: {
        allowView,
        allowDownload,
        expiresAt,
        maxDownloads: input.maxDownloads === undefined ? existing.maxDownloads : input.maxDownloads,
        revokedAt: input.revoked ? new Date() : existing.revokedAt,
      },
      include: SHARE_INCLUDE,
    });

    if (input.revoked && !existing.revokedAt) {
      await writeAuditLog(this.prisma, {
        organizationId,
        userId: actorUserId,
        action: 'share.revoked',
        resourceType: 'share',
        resourceId: share.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }

    return serializeShareLink(this.toRecord(share));
  }

  async revoke(
    organizationId: string,
    shareId: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.update(organizationId, shareId, { revoked: true }, actorUserId, meta);
  }

  async inspect(
    token: string,
    auth: AuthContext | undefined,
    accessToken?: string,
    meta?: RequestMeta,
  ): Promise<PublicShareInspect> {
    const share = await this.loadUsableShare(token);
    await this.assertVisibility(share, auth);

    if (share.passwordHash && !(await this.hasShareAccess(share, undefined, accessToken))) {
      return { passwordRequired: true, share: null };
    }

    if (meta) {
      await writeAuditLog(this.prisma, {
        ...meta,
        organizationId: share.organizationId,
        userId: auth?.user.id ?? null,
        action: 'storage.share.viewed',
        resourceType: 'share',
        resourceId: share.id,
        metadata: { shareId: share.id, objectId: share.objectId, accessMethod: 'inspect' },
      });
    }

    return { passwordRequired: false, share: serializeShareAccess(this.toRecord(share)) };
  }

  async unlock(
    token: string,
    password: string,
    auth: AuthContext | undefined,
  ): Promise<{ share: PublicShareAccess; accessToken: string; expiresAt: string }> {
    const share = await this.loadUsableShare(token);
    await this.assertVisibility(share, auth);

    if (!share.passwordHash) {
      throw sharePasswordInvalid();
    }

    const matches = await this.passwords.verify(password, share.passwordHash);
    if (!matches) {
      throw sharePasswordInvalid();
    }

    const issued = this.storageTokens.issue(
      { purpose: 'share-access', organizationId: share.organizationId, subjectId: share.id },
      SHARE_ACCESS_TTL_SECONDS,
    );

    return {
      share: serializeShareAccess(this.toRecord(share)),
      accessToken: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  async createDownloadUrl(
    token: string,
    auth: AuthContext | undefined,
    secrets: { password?: string; accessToken?: string },
    baseUrl: string,
    meta?: RequestMeta,
  ): Promise<PublicPresignedUrl> {
    const share = await this.loadUsableShare(token);
    await this.assertVisibility(share, auth);

    if (!share.allowDownload) {
      throw shareAccessDenied('This share does not allow downloads');
    }

    if (
      share.passwordHash &&
      !(await this.hasShareAccess(share, secrets.password, secrets.accessToken))
    ) {
      if (!secrets.password && !secrets.accessToken) {
        throw sharePasswordRequired();
      }
      throw sharePasswordInvalid();
    }

    if (shareDownloadLimitReached(share.accessCount, share.maxDownloads)) {
      throw shareDownloadLimitError();
    }

    const consumed = await this.prisma.$executeRaw`
      UPDATE "ShareLink"
      SET
        "accessCount" = "accessCount" + 1,
        "lastAccessAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${share.id}
        AND "revokedAt" IS NULL
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        AND ("maxDownloads" IS NULL OR "accessCount" < "maxDownloads")
    `;

    if (consumed === 0) {
      throw shareDownloadLimitError();
    }

    const issued = this.storageTokens.issue(
      { purpose: 'download', organizationId: share.organizationId, subjectId: share.objectId },
      SHARE_DOWNLOAD_TTL_SECONDS,
    );

    await writeAuditLog(this.prisma, {
      ...meta,
      organizationId: share.organizationId,
      userId: auth?.user.id ?? null,
      action: 'storage.object.downloaded',
      resourceType: 'object',
      resourceId: share.objectId,
      metadata: { shareId: share.id, objectId: share.objectId, accessMethod: 'download-url' },
    });

    return {
      url: `${baseUrl}/api/v1/storage/objects/${share.objectId}/content?token=${issued.token}`,
      method: 'GET',
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  async createPreviewUrl(
    token: string,
    auth: AuthContext | undefined,
    secrets: { password?: string; accessToken?: string },
    baseUrl: string,
    meta?: RequestMeta,
  ): Promise<PublicPresignedUrl> {
    const share = await this.loadUsableShare(token);
    await this.assertVisibility(share, auth);

    if (!share.allowView) {
      throw shareAccessDenied('This share does not allow previews');
    }
    if (
      share.passwordHash &&
      !(await this.hasShareAccess(share, secrets.password, secrets.accessToken))
    ) {
      if (!secrets.password && !secrets.accessToken) {
        throw sharePasswordRequired();
      }
      throw sharePasswordInvalid();
    }

    const issued = this.storageTokens.issue(
      { purpose: 'download', organizationId: share.organizationId, subjectId: share.objectId },
      SHARE_DOWNLOAD_TTL_SECONDS,
    );

    if (meta) {
      await writeAuditLog(this.prisma, {
        ...meta,
        organizationId: share.organizationId,
        userId: auth?.user.id ?? null,
        action: 'storage.share.previewed',
        resourceType: 'share',
        resourceId: share.id,
        metadata: { shareId: share.id, objectId: share.objectId, accessMethod: 'preview-url' },
      });
    }

    return {
      url: `${baseUrl}/api/v1/storage/objects/${share.objectId}/content?token=${issued.token}`,
      method: 'GET',
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  private async requireOwnedShare(organizationId: string, shareId: string): Promise<ShareRow> {
    const share = await this.prisma.shareLink.findFirst({
      where: { id: shareId, organizationId },
      include: SHARE_INCLUDE,
    });
    if (!share) {
      throw shareLinkNotFound();
    }
    return share;
  }

  private async loadUsableShare(token: string): Promise<ShareRow> {
    const share = await this.prisma.shareLink.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
      include: SHARE_INCLUDE,
    });
    if (!share) {
      throw shareLinkNotFound();
    }
    if (shareIsRevoked(share.revokedAt)) {
      throw shareLinkRevoked();
    }
    if (shareIsExpired(share.expiresAt)) {
      throw shareLinkExpired();
    }
    if (share.object.isDeleted) {
      throw storageObjectNotFound();
    }
    return share;
  }

  private async assertVisibility(share: ShareRow, auth: AuthContext | undefined): Promise<void> {
    if (share.visibility === ShareVisibility.PUBLIC_LINK) {
      return;
    }

    if (!auth) {
      throw unauthorized('Authentication is required to access this share');
    }

    if (!auth.organizationIds.includes(share.organizationId)) {
      throw shareAccessDenied('This share is not available to your organization');
    }

    if (share.visibility === ShareVisibility.ORGANIZATION) {
      return;
    }

    if (auth.user.id === share.createdByUserId) {
      return;
    }

    if (share.visibility === ShareVisibility.PRIVATE) {
      throw shareAccessDenied('This share is private');
    }

    if (!share.teamId) {
      throw shareAccessDenied('This team share is no longer valid');
    }

    const member = await this.prisma.teamMember.findFirst({
      where: {
        teamId: share.teamId,
        userId: auth.user.id,
        organizationId: share.organizationId,
      },
    });
    if (!member) {
      throw shareAccessDenied('You are not a member of the team this object was shared with');
    }
  }

  private async hasShareAccess(
    share: ShareRow,
    password: string | undefined,
    accessToken: string | undefined,
  ): Promise<boolean> {
    if (!share.passwordHash) {
      return true;
    }

    if (accessToken) {
      try {
        const claims = this.storageTokens.verify(accessToken, 'share-access');
        return claims.subjectId === share.id && claims.organizationId === share.organizationId;
      } catch {
        return false;
      }
    }

    if (password) {
      return this.passwords.verify(password, share.passwordHash);
    }

    return false;
  }

  private parseExpiresAt(value: string | undefined): Date {
    const expiresAt = value ? new Date(value) : new Date(Date.now() + DEFAULT_SHARE_TTL_MS);
    if (Number.isNaN(expiresAt.getTime())) {
      throw validationError('expiresAt is not a valid timestamp', {
        expiresAt: 'expiresAt is not a valid timestamp',
      });
    }
    const now = Date.now();
    if (expiresAt.getTime() <= now) {
      throw validationError('expiresAt must be in the future', {
        expiresAt: 'expiresAt must be in the future',
      });
    }
    if (expiresAt.getTime() - now > MAX_SHARE_TTL_MS) {
      throw validationError('Share expiration cannot exceed 365 days', {
        expiresAt: 'Share expiration cannot exceed 365 days',
      });
    }
    return expiresAt;
  }

  private toRecord(share: ShareRow): ShareLinkRecord {
    return {
      id: share.id,
      organizationId: share.organizationId,
      objectId: share.objectId,
      createdByUserId: share.createdByUserId,
      teamId: share.teamId,
      tokenPrefix: share.tokenPrefix,
      visibility: share.visibility,
      passwordHash: share.passwordHash,
      allowView: share.allowView,
      allowDownload: share.allowDownload,
      maxDownloads: share.maxDownloads,
      expiresAt: share.expiresAt,
      revokedAt: share.revokedAt,
      lastAccessAt: share.lastAccessAt,
      accessCount: share.accessCount,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      object: {
        key: share.object.key,
        size: share.object.size,
        contentType: share.object.contentType,
      },
    };
  }
}

export function createShareService(
  prisma: PrismaClient,
  storageTokens: StorageTokenService,
  nodeEnv: string,
): ShareService {
  return new ShareService(prisma, storageTokens, nodeEnv);
}
