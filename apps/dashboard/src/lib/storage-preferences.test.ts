import { describe, expect, it } from 'vitest';
import {
  buildObjectKey,
  getFavoriteIds,
  toggleFavorite,
} from './storage-preferences.js';

describe('storage preferences', () => {
  it('builds object keys with optional prefixes', () => {
    expect(buildObjectKey('', 'file.txt')).toBe('file.txt');
    expect(buildObjectKey('docs/', 'file.txt')).toBe('docs/file.txt');
  });

  it('tracks favorites in memory/localStorage', () => {
    const objectId = `object-${Date.now()}`;
    toggleFavorite(objectId);
    expect(getFavoriteIds().has(objectId)).toBe(true);
    toggleFavorite(objectId);
    expect(getFavoriteIds().has(objectId)).toBe(false);
  });
});
