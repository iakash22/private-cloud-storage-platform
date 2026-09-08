import type {
  CreatedShareLink,
  PublicShareAccess,
  PublicShareLink,
  ShareVisibilityName,
} from '@vaultstack/types';
import { shareFileName } from '../domain/share-access.js';

export interface ShareLinkRecord {
  id: string;
  organizationId: string;
  objectId: string;
  createdByUserId: string | null;
  teamId: string | null;
  tokenPrefix: string;
  visibility: string;
  passwordHash: string | null;
  allowView: boolean;
  allowDownload: boolean;
  maxDownloads: number | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastAccessAt: Date | null;
  accessCount: number;
  createdAt: Date;
  updatedAt: Date;
  object: { key: string; size: bigint; contentType: string };
}

export function serializeShareLink(share: ShareLinkRecord): PublicShareLink {
  return {
    id: share.id,
    organizationId: share.organizationId,
    objectId: share.objectId,
    fileName: shareFileName(share.object.key),
    visibility: share.visibility as ShareVisibilityName,
    teamId: share.teamId,
    tokenPrefix: share.tokenPrefix,
    hasPassword: Boolean(share.passwordHash),
    allowView: share.allowView,
    allowDownload: share.allowDownload,
    maxDownloads: share.maxDownloads,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
    lastAccessAt: share.lastAccessAt?.toISOString() ?? null,
    accessCount: share.accessCount,
    createdByUserId: share.createdByUserId,
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
  };
}

export function serializeCreatedShareLink(share: ShareLinkRecord, token: string): CreatedShareLink {
  return { ...serializeShareLink(share), token };
}

export function serializeShareAccess(share: ShareLinkRecord): PublicShareAccess {
  return {
    fileName: shareFileName(share.object.key),
    size: Number(share.object.size),
    contentType: share.object.contentType,
    visibility: share.visibility as ShareVisibilityName,
    allowView: share.allowView,
    allowDownload: share.allowDownload,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    hasPassword: Boolean(share.passwordHash),
  };
}
