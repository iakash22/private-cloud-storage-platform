import { gunzipSync, unzipSync } from 'fflate';

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_MEMBERS = 10_000;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;

export interface ArchiveEntry {
  name: string;
  type: 'file' | 'directory';
  compressedSize?: number;
  size: number;
}

export function listArchive(bytes: Uint8Array, fileName: string): ArchiveEntry[] {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('Archive exceeds the preview size limit');
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.zip')) {
    return listZip(bytes);
  }
  if (lower.endsWith('.tar')) {
    return listTar(bytes);
  }
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return listTar(gunzipSync(bytes));
  }
  throw new Error('Only ZIP, TAR, and TAR.GZ archives are supported');
}

function listZip(bytes: Uint8Array): ArchiveEntry[] {
  const files = unzipSync(bytes);
  const entries: ArchiveEntry[] = [];
  let expanded = 0;
  for (const [rawName, content] of Object.entries(files)) {
    const name = safeName(rawName);
    const directory = name.endsWith('/');
    const size = directory ? 0 : content.byteLength;
    expanded += size;
    assertLimits(entries.length + 1, expanded);
    entries.push({ name, type: directory ? 'directory' : 'file', size });
  }
  return entries;
}

function listTar(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  let expanded = 0;
  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) {
      break;
    }
    const name = safeName(readString(header, 0, 100));
    const size = readOctal(header, 124, 12);
    const typeFlag = header[156] ?? 0;
    if (typeFlag === 0 || typeFlag === 48 || typeFlag === 53) {
      expanded += typeFlag === 53 ? 0 : size;
      assertLimits(entries.length + 1, expanded);
      entries.push({
        name,
        type: typeFlag === 53 || name.endsWith('/') ? 'directory' : 'file',
        size: typeFlag === 53 ? 0 : size,
      });
    } else if (typeFlag === 49 || typeFlag === 50 || typeFlag === 51 || typeFlag === 52 || typeFlag === 54 || typeFlag === 55) {
      throw new Error('Archive contains unsupported special files');
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function safeName(value: string): string {
  const name = value.replaceAll('\\', '/').replace(/^\/+/, '');
  const parts = name.split('/');
  if (parts.some((part) => part === '..' || part === '.')) {
    throw new Error('Archive contains an unsafe path');
  }
  if (!name || name.length > 512) {
    throw new Error('Archive contains an invalid path');
  }
  return name;
}

function assertLimits(memberCount: number, expandedBytes: number): void {
  if (memberCount > MAX_MEMBERS) {
    throw new Error('Archive contains too many members');
  }
  if (expandedBytes > MAX_EXPANDED_BYTES) {
    throw new Error('Archive expands beyond the preview limit');
  }
}

function readString(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\0.*$/, '').trim();
}

function readOctal(bytes: Uint8Array, start: number, length: number): number {
  const value = readString(bytes, start, length).replace(/\0/g, '').trim();
  return value ? Number.parseInt(value, 8) : 0;
}
