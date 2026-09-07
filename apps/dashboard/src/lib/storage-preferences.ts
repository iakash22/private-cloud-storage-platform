import { PERMISSIONS } from '@vaultstack/types';

const FAVORITES_KEY = 'vaultstack:favorites';
const RECENT_FILES_KEY = 'vaultstack:recent-files';
const SELECTED_BUCKET_KEY = 'vaultstack:selected-bucket';
const TRASH_KEY = 'vaultstack:trash-items';

export interface RecentFileRecord {
  id: string;
  bucketId: string;
  key: string;
  name: string;
  accessedAt: string;
}

export interface TrashRecord {
  id: string;
  bucketId: string;
  key: string;
  name: string;
  size: number;
  deletedAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getFavoriteIds(): Set<string> {
  return new Set(readJson<string[]>(FAVORITES_KEY, []));
}

export function toggleFavorite(objectId: string): Set<string> {
  const favorites = getFavoriteIds();
  if (favorites.has(objectId)) {
    favorites.delete(objectId);
  } else {
    favorites.add(objectId);
  }

  writeJson(FAVORITES_KEY, Array.from(favorites));
  return favorites;
}

export function getRecentFiles(limit = 10): RecentFileRecord[] {
  return readJson<RecentFileRecord[]>(RECENT_FILES_KEY, [])
    .sort((left, right) => new Date(right.accessedAt).getTime() - new Date(left.accessedAt).getTime())
    .slice(0, limit);
}

export function recordRecentFile(record: Omit<RecentFileRecord, 'accessedAt'>): RecentFileRecord[] {
  const next = [
    { ...record, accessedAt: new Date().toISOString() },
    ...getRecentFiles(50).filter((item) => item.id !== record.id),
  ].slice(0, 50);

  writeJson(RECENT_FILES_KEY, next);
  return next.slice(0, 10);
}

export function getSelectedBucketId(): string | undefined {
  return localStorage.getItem(SELECTED_BUCKET_KEY) ?? undefined;
}

export function setSelectedBucketId(bucketId: string): void {
  localStorage.setItem(SELECTED_BUCKET_KEY, bucketId);
}

export function getTrashItems(): TrashRecord[] {
  return readJson<TrashRecord[]>(TRASH_KEY, []);
}

export function addTrashItem(record: Omit<TrashRecord, 'deletedAt'>): TrashRecord[] {
  const next = [{ ...record, deletedAt: new Date().toISOString() }, ...getTrashItems()];
  writeJson(TRASH_KEY, next);
  return next;
}

export function removeTrashItem(objectId: string): TrashRecord[] {
  const next = getTrashItems().filter((item) => item.id !== objectId);
  writeJson(TRASH_KEY, next);
  return next;
}

export function hasPermission(permissions: string[], permission: string): boolean {
  return permissions.includes(permission);
}

export function canReadStorage(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.STORAGE_READ);
}

export function canUploadStorage(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.STORAGE_UPLOAD);
}

export function canDeleteStorage(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.STORAGE_DELETE);
}

export function buildObjectKey(prefix: string, fileName: string): string {
  const normalizedPrefix = prefix.replace(/^\/+/, '');
  if (!normalizedPrefix) {
    return fileName;
  }

  return normalizedPrefix.endsWith('/') ? `${normalizedPrefix}${fileName}` : `${normalizedPrefix}/${fileName}`;
}
