import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '@vaultstack/types';
import { PERMISSION_DESCRIPTIONS } from './permissions.js';
import { slugifyName, uniqueSlug } from './slug.js';

describe('@vaultstack/database', () => {
  it('describes every seeded permission', () => {
    for (const key of ALL_PERMISSIONS) {
      expect(PERMISSION_DESCRIPTIONS[key].length).toBeGreaterThan(0);
    }
  });

  it('creates URL-safe organization slugs', () => {
    expect(slugifyName('Acme Cloud')).toBe('acme-cloud');
    expect(uniqueSlug('Acme Cloud')).toMatch(/^acme-cloud-[a-f0-9]{6}$/);
  });

  it('exports syncSystemRolePermissions from the package entry', async () => {
    const database = await import('./index.js');
    expect(typeof database.syncSystemRolePermissions).toBe('function');
    expect(typeof database.seedDatabase).toBe('function');
  });
});
