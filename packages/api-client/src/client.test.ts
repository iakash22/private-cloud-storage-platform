import { describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER_NAME, ORGANIZATION_HEADER_NAME } from '@vaultstack/types';
import { VaultStackApiClient } from './client.js';
import type { HttpRequestInit } from './http.js';

describe('VaultStackApiClient storage + auth', () => {
  it('sends credentials, CSRF, and organization headers on storage requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ buckets: [] }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });

    client.setCsrfToken('csrf-token');
    client.setOrganizationId('org-1');

    await client.listBuckets();

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/api/v1/storage/buckets', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [ORGANIZATION_HEADER_NAME]: 'org-1',
      },
      body: undefined,
      credentials: 'include',
    });
  });

  it('stores CSRF token from login response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          user: { id: 'u1', email: 'a@b.com', name: 'A', disabled: false, createdAt: '', updatedAt: '' },
          organizations: [{ id: 'org-1', name: 'Org', slug: 'org', createdAt: '', updatedAt: '' }],
          memberships: [{ organizationId: 'org-1', roles: ['SUPER_ADMIN'], permissions: ['storage.read'] }],
          csrfToken: 'csrf-token',
        }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });

    await client.login({ email: 'a@b.com', password: 'password123' });

    expect(client.getCsrfToken()).toBe('csrf-token');
    expect(client.getOrganizationId()).toBe('org-1');
  });

  it('initiates and completes uploads through the API', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            upload: { id: 'upload-1' },
            uploadUrl: 'http://localhost:3000/api/v1/storage/uploads/upload-1/content?token=abc',
            method: 'PUT',
            expiresAt: new Date().toISOString(),
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            object: { id: 'obj-1', key: 'file.txt', bucketId: 'bucket-1', size: 4 },
          }),
      });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });
    client.setCsrfToken('csrf-token');

    const initiated = await client.initiateUpload({
      bucketId: 'bucket-1',
      key: 'file.txt',
      size: 4,
    });
    expect(initiated.upload.id).toBe('upload-1');

    const object = await client.completeUpload('upload-1');
    expect(object.id).toBe('obj-1');

    const completeUploadCall = fetchImpl.mock.calls[1];
    expect(completeUploadCall).toBeDefined();
    const requestInit = completeUploadCall?.[1] as HttpRequestInit | undefined;
    expect(requestInit?.headers?.[CSRF_HEADER_NAME]).toBe('csrf-token');
  });

  it('initiates a multipart session with the declared size', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          uploadId: 'mp-1',
          providerUploadId: 'provider-1',
          key: 'big.bin',
          session: { id: 'mp-1', status: 'INITIATED', declaredSize: 20 },
        }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });
    client.setCsrfToken('csrf-token');

    const initiated = await client.initiateMultipart({
      bucketId: 'bucket-1',
      key: 'big.bin',
      size: 20,
    });

    expect(initiated.uploadId).toBe('mp-1');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/storage/multipart-uploads',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
