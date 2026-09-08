export function shareFileName(objectKey: string): string {
  return objectKey.split('/').filter(Boolean).at(-1) ?? 'download';
}

export function shareIsExpired(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

export function shareIsRevoked(revokedAt: Date | null): boolean {
  return revokedAt !== null;
}

export function shareDownloadLimitReached(
  accessCount: number,
  maxDownloads: number | null,
): boolean {
  return maxDownloads !== null && accessCount >= maxDownloads;
}

export const SHARE_DOWNLOAD_TTL_SECONDS = 60;
export const SHARE_ACCESS_TTL_SECONDS = 900;
export const DEFAULT_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SHARE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
