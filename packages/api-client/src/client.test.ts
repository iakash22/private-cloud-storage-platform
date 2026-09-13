import { describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER_NAME, ORGANIZATION_HEADER_NAME } from '@vaultstack/types';
import { VaultStackApiClient } from './client.js';
import type { HttpRequestInit } from './http.js';

describe('VaultStackApiClient storage + auth', () => {
  it('uses bearer API-key auth without cookies or CSRF', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ buckets: [] }),
    });
    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'vs_ak_test',
      fetchImpl,
    });
    client.setCsrfToken('should-not-be-sent');

    await client.listBuckets();

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/storage/buckets',
      expect.objectContaining({
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer vs_ak_test',
        },
      }),
    );
  });

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

  it('invokes onUnauthorized for authenticated 401 responses', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () =>
        Promise.resolve({
          error: { code: 'UNAUTHORIZED', message: 'Session expired' },
          requestId: 'req-1',
        }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
      onUnauthorized,
    });
    client.setOrganizationId('org-1');

    await expect(client.listBuckets()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onUnauthorized for login 401 responses', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () =>
        Promise.resolve({
          error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
          requestId: 'req-2',
        }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
      onUnauthorized,
    });

    await expect(client.login({ email: 'a@b.com', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('clearSession drops CSRF and organization state', () => {
    const client = new VaultStackApiClient({ baseUrl: 'http://localhost:3000' });
    client.setCsrfToken('csrf');
    client.setOrganizationId('org-1');
    client.clearSession();
    expect(client.getCsrfToken()).toBeUndefined();
    expect(client.getOrganizationId()).toBeUndefined();
  });

  it('stores CSRF token from login response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          user: {
            id: 'u1',
            email: 'a@b.com',
            name: 'A',
            disabled: false,
            twoFactorEnabled: false,
            createdAt: '',
            updatedAt: '',
          },
          organizations: [{ id: 'org-1', name: 'Org', slug: 'org', createdAt: '', updatedAt: '' }],
          memberships: [
            { organizationId: 'org-1', roles: ['SUPER_ADMIN'], permissions: ['storage.read'] },
          ],
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

  it('does not store a session from a TOTP login challenge', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          totpRequired: true,
          challengeToken: 'challenge-token',
        }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });

    const result = await client.login({ email: 'a@b.com', password: 'password123' });

    expect(result).toEqual({ totpRequired: true, challengeToken: 'challenge-token' });
    expect(client.getCsrfToken()).toBeUndefined();
    expect(client.getOrganizationId()).toBeUndefined();
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

  it('puts an object with one initiate, transfer, and complete flow', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            upload: { id: 'upload-1' },
            uploadUrl: 'http://localhost:3000/upload/upload-1',
            method: 'PUT',
            expiresAt: new Date().toISOString(),
          }),
      })
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ object: { id: 'obj-1' } }),
      });
    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'vs_ak_test',
      fetchImpl,
    });

    const object = await client.putObject({
      bucketId: 'bucket-1',
      key: 'file.txt',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'text/plain',
    });

    expect(object.id).toBe('obj-1');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/upload/upload-1',
      expect.objectContaining({
        method: 'PUT',
        body: expect.any(Uint8Array),
        credentials: 'omit',
      }),
    );
  });

  it('uploads an artifact with the high-level helper', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            artifact: { id: 'artifact-1' },
            version: { id: 'version-1' },
            upload: { id: 'upload-1' },
            uploadUrl: 'http://localhost:3000/upload/upload-1',
            method: 'PUT',
            expiresAt: new Date().toISOString(),
          }),
      })
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ version: { id: 'version-1', status: 'AVAILABLE' } }),
      });
    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'vs_ak_test',
      fetchImpl,
    });

    const version = await client.uploadArtifact({
      projectId: 'project-1',
      buildId: 'build-1',
      name: 'app',
      body: new Uint8Array([1, 2]),
    });

    expect(version).toMatchObject({ id: 'version-1', status: 'AVAILABLE' });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/v1/artifacts/projects/project-1/builds/build-1/artifacts',
      expect.objectContaining({ method: 'POST' }),
    );
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

  it('lists CI artifact projects through the artifacts API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });
    client.setCsrfToken('csrf-token');
    client.setOrganizationId('org-1');

    await client.listProjects();

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/api/v1/artifacts/projects', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [ORGANIZATION_HEADER_NAME]: 'org-1',
      },
      body: undefined,
      credentials: 'include',
    });
  });

  it('patches a build and lists project artifacts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ build: { id: 'build-1' }, artifacts: [] }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });
    client.setCsrfToken('csrf-token');
    client.setOrganizationId('org-1');

    await client.updateBuild('project-1', 'build-1', { status: 'SUCCEEDED' });
    await client.listProjectArtifacts('project-1');

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/artifacts/projects/project-1/builds/build-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/artifacts/projects/project-1/artifacts',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates a backup job through the backups API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ job: { id: 'job-1' } }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });
    client.setCsrfToken('csrf-token');
    client.setOrganizationId('org-1');

    await client.createBackupJob({ targets: ['VAULTSTACK_METADATA'] });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/backups/jobs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('loads infrastructure summary through the monitoring API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ summary: { docker: { available: false } } }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });
    client.setOrganizationId('org-1');

    await client.getInfrastructureSummary();

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/infrastructure/summary',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lists organization users through the access API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ users: [] }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });
    client.setOrganizationId('org-1');

    await client.listUsers('org-1');

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/organizations/org-1/users',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('surfaces API field errors on client failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () =>
        Promise.resolve({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'email: Invalid email',
            fields: { email: 'Invalid email' },
          },
          requestId: 'req-9',
        }),
    });

    const client = new VaultStackApiClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
    });

    await expect(client.login({ email: 'bad', password: 'x' })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_ERROR',
      fields: { email: 'Invalid email' },
    });
  });
});
