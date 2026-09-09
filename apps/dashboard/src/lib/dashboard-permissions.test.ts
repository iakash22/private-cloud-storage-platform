import { PERMISSIONS } from '@vaultstack/types';
import { describe, expect, it } from 'vitest';
import {
  canDeleteArtifacts,
  canManageAccess,
  canReadAccess,
  canReadActivity,
  canReadArtifacts,
  canReadSettings,
  canUploadArtifacts,
} from './dashboard-permissions.js';

describe('dashboard permissions', () => {
  it('only exposes sections granted by the organization role', () => {
    const viewer = [PERMISSIONS.STORAGE_READ];
    expect(canReadArtifacts(viewer)).toBe(false);
    expect(canReadAccess(viewer)).toBe(false);
    expect(canReadActivity(viewer)).toBe(false);
    expect(canReadSettings(viewer)).toBe(false);
  });

  it('allows administrators to see management sections', () => {
    const administrator = [
      PERMISSIONS.ARTIFACT_READ,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.AUDIT_READ,
    ];
    expect(canReadArtifacts(administrator)).toBe(true);
    expect(canReadAccess(administrator)).toBe(true);
    expect(canManageAccess(administrator)).toBe(true);
    expect(canReadActivity(administrator)).toBe(true);
    expect(canReadSettings(administrator)).toBe(true);
  });

  it('separates artifact upload and delete from read', () => {
    expect(canUploadArtifacts([PERMISSIONS.ARTIFACT_READ])).toBe(false);
    expect(canDeleteArtifacts([PERMISSIONS.ARTIFACT_READ])).toBe(false);
    expect(canUploadArtifacts([PERMISSIONS.ARTIFACT_UPLOAD])).toBe(true);
    expect(canDeleteArtifacts([PERMISSIONS.ARTIFACT_DELETE])).toBe(true);
  });
});
