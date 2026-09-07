import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  ALL_SYSTEM_ROLES,
  PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  type HealthResponse,
  type MultipartPartTransferDescriptor,
  type PublicMultipartSessionDetail,
} from './index.js';

describe('@vaultstack/types', () => {
  it('exports health response shape', () => {
    const health: HealthResponse = {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime: 0,
    };

    expect(health.status).toBe('ok');
  });

  it('includes Phase 2 permission keys', () => {
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.STORAGE_READ);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.USERS_MANAGE);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.AUDIT_READ);
    expect(ALL_PERMISSIONS).toHaveLength(16);
  });

  it('defines the six system roles and SUPER_ADMIN has every permission', () => {
    expect(ALL_SYSTEM_ROLES).toEqual([
      SYSTEM_ROLES.SUPER_ADMIN,
      SYSTEM_ROLES.ADMIN,
      SYSTEM_ROLES.STORAGE_ADMIN,
      SYSTEM_ROLES.BACKUP_ADMIN,
      SYSTEM_ROLES.DEVELOPER,
      SYSTEM_ROLES.VIEWER,
    ]);
    expect(SYSTEM_ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(ALL_PERMISSIONS);
    expect(SYSTEM_ROLE_PERMISSIONS.VIEWER).not.toContain(PERMISSIONS.USERS_MANAGE);
  });

  it('exposes browser-safe multipart session contracts', () => {
    const transfer: MultipartPartTransferDescriptor = {
      transport: 'DIRECT',
      url: 'https://storage.example.test/presigned-part',
      method: 'PUT',
      headers: { 'x-checksum-sha256': 'a'.repeat(64) },
      expiresAt: '2026-09-08T02:00:00.000Z',
      partNumber: 1,
    };
    const session: PublicMultipartSessionDetail = {
      id: 'upload-1',
      organizationId: 'organization-1',
      bucketId: 'bucket-1',
      key: 'archive.tar',
      status: 'UPLOADING',
      contentType: 'application/x-tar',
      declaredSize: 1024,
      expiresAt: '2026-09-09T00:00:00.000Z',
      lastActivityAt: '2026-09-08T01:30:00.000Z',
      completedAt: null,
      failureCode: null,
      createdAt: '2026-09-08T01:00:00.000Z',
      updatedAt: '2026-09-08T01:30:00.000Z',
      parts: [
        {
          partNumber: 1,
          size: 1024,
          etag: 'part-etag',
          checksumSha256: 'a'.repeat(64),
          createdAt: '2026-09-08T01:30:00.000Z',
          updatedAt: '2026-09-08T01:30:00.000Z',
        },
      ],
    };

    expect(transfer).not.toHaveProperty('credentials');
    expect(transfer.method).toBe('PUT');
    expect(session.parts[0]?.partNumber).toBe(1);
  });
});
