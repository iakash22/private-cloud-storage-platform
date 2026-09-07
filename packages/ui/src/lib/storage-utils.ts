export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function splitObjectKey(key: string): { name: string; parentPrefix: string } {
  const normalized = key.replace(/^\/+/, '');
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash === -1) {
    return { name: normalized, parentPrefix: '' };
  }

  return {
    name: normalized.slice(lastSlash + 1),
    parentPrefix: normalized.slice(0, lastSlash + 1),
  };
}

export function joinPrefix(prefix: string, segment: string): string {
  const base = prefix.endsWith('/') || prefix.length === 0 ? prefix : `${prefix}/`;
  return `${base}${segment.replace(/^\/+/, '')}${segment.endsWith('/') ? '' : '/'}`;
}

export function breadcrumbSegments(prefix: string): { label: string; prefix: string }[] {
  const trimmed = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return [{ label: 'Root', prefix: '' }];
  }

  const parts = trimmed.split('/');
  const segments: { label: string; prefix: string }[] = [{ label: 'Root', prefix: '' }];

  let current = '';
  for (const part of parts) {
    current = current ? `${current}${part}/` : `${part}/`;
    segments.push({ label: part, prefix: current });
  }

  return segments;
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) {
    return '';
  }

  return name.slice(index + 1).toLowerCase();
}

export type SortField = 'name' | 'size' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export function sortEntries<T extends { name: string; size?: number; updatedAt?: string }>(
  entries: T[],
  field: SortField,
  direction: SortDirection,
): T[] {
  const sorted = [...entries].sort((left, right) => {
    if (field === 'name') {
      return left.name.localeCompare(right.name);
    }

    if (field === 'size') {
      return (left.size ?? 0) - (right.size ?? 0);
    }

    return new Date(left.updatedAt ?? 0).getTime() - new Date(right.updatedAt ?? 0).getTime();
  });

  return direction === 'asc' ? sorted : sorted.reverse();
}
