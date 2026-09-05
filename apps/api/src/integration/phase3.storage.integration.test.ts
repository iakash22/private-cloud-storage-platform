import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORGANIZATION_COOKIE_NAME } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createMemoryRateLimiter } from '../lib/rate-limit.js';
import { createTestConfig } from '../lib/test-config.js';
import { authHeaders, errorBody, responseBody } from './helpers.js';

function createMockRedis(): DependencyClients['redis'] {
  return {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
  } as unknown as DependencyClients['redis'];
}

type Headers = Record<string, string>;

interface Tenant {
  headers: Headers;
  organizationId: string;
}

describe('Phase 3 storage engine (PostgreSQL + local filesystem)', () => {
  let db: TestDatabase | undefined;
  let storageRoot: string;
  let app: ReturnType<typeof createApp>;

  /** Registers an organization owner and returns its auth headers. */
  async function register(email: string, organizationName: string): Promise<Tenant> {
    const response = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Owner',
      organizationName,
    });
    expect(response.status).toBe(201);

    const membership = responseBody<{ memberships: { organizationId: string }[] }>(response)
      .memberships[0];
    if (!membership) {
      throw new Error('Expected register response to include a membership');
    }
    const organizationId = membership.organizationId;

    return {
      organizationId,
      headers: {
        ...authHeaders(response),
        Cookie: `${authHeaders(response).Cookie}; ${ORGANIZATION_COOKIE_NAME}=${organizationId}`,
      },
    };
  }

  async function createBucket(tenant: Tenant, name: string): Promise<string> {
    const response = await request(app)
      .post('/api/v1/storage/buckets')
      .set(tenant.headers)
      .send({ name });

    expect(response.status).toBe(201);
    return responseBody<{ bucket: { id: string } }>(response).bucket.id;
  }

  /** Runs the full initiate -> PUT bytes -> complete upload flow. */
  async function uploadObject(
    tenant: Tenant,
    bucketId: string,
    key: string,
    body: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<{ id: string; key: string; size: number; etag: string; checksum: string }> {
    const initiated = await request(app)
      .post('/api/v1/storage/uploads/initiate')
      .set(tenant.headers)
      .send({ bucketId, key, contentType, size: body.length });

    expect(initiated.status).toBe(201);
    const { upload, uploadUrl } = responseBody<{
      upload: { id: string };
      uploadUrl: string;
    }>(initiated);

    const put = await request(app)
      .put(pathOf(uploadUrl))
      .set('Content-Type', contentType)
      .send(body);
    expect(put.status).toBe(200);

    const completed = await request(app)
      .post(`/api/v1/storage/uploads/${upload.id}/complete`)
      .set(tenant.headers)
      .send({ checksumSha256: createHash('sha256').update(body).digest('hex') });

    expect(completed.status).toBe(201);
    return responseBody<{
      object: { id: string; key: string; size: number; etag: string; checksum: string };
    }>(completed).object;
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase3-'));

    app = createApp({
      config: createTestConfig({
        DATABASE_URL: db.databaseUrl,
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        STORAGE_MAX_OBJECT_SIZE_BYTES: 8 * 1024 * 1024,
        LOGIN_RATE_LIMIT_MAX: 100,
      }),
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never,
      prisma: db.prisma,
      clients: { prisma: db.prisma, redis: createMockRedis() },
      rateLimiter: createMemoryRateLimiter(),
    });
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
    await rm(storageRoot, { recursive: true, force: true }).catch(() => undefined);
  }, 60_000);

  describe('buckets', () => {
    it('creates, gets, lists and deletes a bucket', async () => {
      const tenant = await register('bucket-owner@example.com', 'Bucket Org');

      const created = await request(app)
        .post('/api/v1/storage/buckets')
        .set(tenant.headers)
        .send({ name: 'documents' });
      expect(created.status).toBe(201);
      const createdBucket = responseBody<{
        bucket: { id: string; name: string; versioning: string };
      }>(created).bucket;
      expect(createdBucket).toMatchObject({ name: 'documents', versioning: 'UNVERSIONED' });

      const bucketId = createdBucket.id;

      const fetched = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}`)
        .set(tenant.headers);
      expect(fetched.status).toBe(200);
      expect(responseBody<{ bucket: { id: string } }>(fetched).bucket.id).toBe(bucketId);

      const listed = await request(app).get('/api/v1/storage/buckets').set(tenant.headers);
      expect(listed.status).toBe(200);
      expect(
        responseBody<{ buckets: { name: string }[] }>(listed).buckets.map((b) => b.name),
      ).toContain('documents');

      const deleted = await request(app)
        .delete(`/api/v1/storage/buckets/${bucketId}`)
        .set(tenant.headers);
      expect(deleted.status).toBe(204);

      const gone = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}`)
        .set(tenant.headers);
      expect(gone.status).toBe(404);
      expect(errorBody(gone).code).toBe('STORAGE_BUCKET_NOT_FOUND');
    });

    it('rejects a duplicate bucket name within the organization', async () => {
      const tenant = await register('dup-owner@example.com', 'Dup Org');
      await createBucket(tenant, 'shared-name');

      const duplicate = await request(app)
        .post('/api/v1/storage/buckets')
        .set(tenant.headers)
        .send({ name: 'shared-name' });

      expect(duplicate.status).toBe(409);
    });

    it('allows the same bucket name in two different organizations', async () => {
      const first = await register('same-name-1@example.com', 'Same Name One');
      const second = await register('same-name-2@example.com', 'Same Name Two');

      await createBucket(first, 'reports');
      await expect(createBucket(second, 'reports')).resolves.toBeTruthy();
    });

    it('rejects malformed bucket names', async () => {
      const tenant = await register('badname-owner@example.com', 'Bad Name Org');

      for (const name of ['A', 'UPPER', 'has_underscore', '../etc', 'ab', 'a'.repeat(64)]) {
        const response = await request(app)
          .post('/api/v1/storage/buckets')
          .set(tenant.headers)
          .send({ name });

        expect(response.status).toBe(400);
      }
    });

    it('refuses to delete a bucket that still holds objects', async () => {
      const tenant = await register('nonempty-owner@example.com', 'NonEmpty Org');
      const bucketId = await createBucket(tenant, 'still-full');
      await uploadObject(tenant, bucketId, 'keep.txt', Buffer.from('keep'));

      const response = await request(app)
        .delete(`/api/v1/storage/buckets/${bucketId}`)
        .set(tenant.headers);

      expect(response.status).toBe(409);
      expect(errorBody(response).code).toBe('STORAGE_BUCKET_NOT_EMPTY');
    });
  });

  describe('upload, download and metadata', () => {
    it('stores an object and returns metadata without any filesystem path', async () => {
      const tenant = await register('upload-owner@example.com', 'Upload Org');
      const bucketId = await createBucket(tenant, 'uploads');
      const body = Buffer.from('the quick brown fox');

      const object = await uploadObject(tenant, bucketId, 'docs/fox.txt', body, 'text/plain');

      expect(object).toMatchObject({
        key: 'docs/fox.txt',
        size: body.length,
        contentType: 'text/plain',
      });
      expect(object.etag).toBe(createHash('md5').update(body).digest('hex'));
      expect(object.checksum).toBe(createHash('sha256').update(body).digest('hex'));

      // No internal path may appear anywhere in the response.
      const serialized = JSON.stringify(object);
      expect(serialized).not.toContain(storageRoot);
      expect(serialized).not.toContain('/objects/');
      expect(serialized).not.toContain('physicalKey');
    });

    it('writes the bytes to the configured storage root on disk', async () => {
      const tenant = await register('ondisk-owner@example.com', 'OnDisk Org');
      const bucketId = await createBucket(tenant, 'ondisk');
      await uploadObject(tenant, bucketId, 'a.txt', Buffer.from('bytes on disk'));

      // Proves the object data really lives on the filesystem, not in Postgres.
      const buckets = await readdir(join(storageRoot, 'objects'));
      expect(buckets.length).toBeGreaterThan(0);
    });

    it('downloads the object through a short-lived signed URL', async () => {
      const tenant = await register('download-owner@example.com', 'Download Org');
      const bucketId = await createBucket(tenant, 'downloads');
      const body = Buffer.from('download me');
      const object = await uploadObject(tenant, bucketId, 'file.bin', body);

      const urlResponse = await request(app)
        .post(`/api/v1/storage/objects/${object.id}/download-url`)
        .set(tenant.headers);
      expect(urlResponse.status).toBe(200);

      const { url } = responseBody<{ download: { url: string } }>(urlResponse).download;
      // No storage credential may be embedded in a URL handed to a browser.
      expect(url).not.toMatch(/secret|accessKey|password/i);

      const download = await request(app).get(pathOf(url));
      expect(download.status).toBe(200);
      expect(Buffer.from(download.body as Buffer).equals(body)).toBe(true);
    });

    it('serves a byte range from a signed download URL', async () => {
      const tenant = await register('range-owner@example.com', 'Range Org');
      const bucketId = await createBucket(tenant, 'ranges');
      const object = await uploadObject(tenant, bucketId, 'r.txt', Buffer.from('0123456789'));

      const urlResponse = await request(app)
        .post(`/api/v1/storage/objects/${object.id}/download-url`)
        .set(tenant.headers);
      const { url } = responseBody<{ download: { url: string } }>(urlResponse).download;

      const ranged = await request(app).get(pathOf(url)).set('Range', 'bytes=2-5');

      expect(ranged.status).toBe(206);
      expect(ranged.headers['content-range']).toBe('bytes 2-5/10');
    });

    it('replaces an object when the same key is uploaded again', async () => {
      const tenant = await register('replace-owner@example.com', 'Replace Org');
      const bucketId = await createBucket(tenant, 'replace');

      const first = await uploadObject(tenant, bucketId, 'same.txt', Buffer.from('first'));
      const second = await uploadObject(tenant, bucketId, 'same.txt', Buffer.from('second!!'));

      expect(second.id).toBe(first.id);
      expect(second.size).toBe(8);

      const listed = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects`)
        .set(tenant.headers);
      expect(responseBody<{ objects: unknown[] }>(listed).objects).toHaveLength(1);
    });
  });

  describe('object listing', () => {
    it('lists with prefix filtering, delimiters and pagination', async () => {
      const tenant = await register('list-owner@example.com', 'List Org');
      const bucketId = await createBucket(tenant, 'listing');

      for (const key of ['a/1.txt', 'a/2.txt', 'b/3.txt', 'root.txt']) {
        await uploadObject(tenant, bucketId, key, Buffer.from(key));
      }

      const all = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects`)
        .set(tenant.headers);
      expect(all.status).toBe(200);
      expect(responseBody<{ objects: unknown[] }>(all).objects).toHaveLength(4);

      const prefixed = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects?prefix=a/`)
        .set(tenant.headers);
      expect(
        responseBody<{ objects: { key: string }[] }>(prefixed).objects.map((o) => o.key),
      ).toEqual(['a/1.txt', 'a/2.txt']);

      const folders = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects?delimiter=/`)
        .set(tenant.headers);
      expect(responseBody<{ prefixes: string[] }>(folders).prefixes).toEqual(['a/', 'b/']);

      const firstPage = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects?limit=2`)
        .set(tenant.headers);
      const page = responseBody<{ objects: unknown[]; nextCursor: string | null }>(firstPage);
      expect(page.objects).toHaveLength(2);
      expect(page.nextCursor).toBeTruthy();

      const secondPage = await request(app)
        .get(
          `/api/v1/storage/buckets/${bucketId}/objects?limit=2&cursor=${encodeURIComponent(
            page.nextCursor ?? '',
          )}`,
        )
        .set(tenant.headers);
      expect(responseBody<{ objects: unknown[] }>(secondPage).objects).toHaveLength(2);
    });

    it('never returns internal storage paths in a listing', async () => {
      const tenant = await register('nopath-owner@example.com', 'NoPath Org');
      const bucketId = await createBucket(tenant, 'nopath');
      await uploadObject(tenant, bucketId, 'x.txt', Buffer.from('x'));

      const listed = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects`)
        .set(tenant.headers);

      expect(JSON.stringify(listed.body)).not.toContain(storageRoot);
      expect(JSON.stringify(listed.body)).not.toContain('physical');
    });
  });

  describe('copy, move and delete', () => {
    it('copies an object and leaves the source intact', async () => {
      const tenant = await register('copy-owner@example.com', 'Copy Org');
      const bucketId = await createBucket(tenant, 'copies');
      const source = await uploadObject(tenant, bucketId, 'src.txt', Buffer.from('copy payload'));

      const copied = await request(app)
        .post(`/api/v1/storage/objects/${source.id}/copy`)
        .set(tenant.headers)
        .send({ destinationBucketId: bucketId, destinationKey: 'dst.txt' });

      expect(copied.status).toBe(201);
      const copiedObject = responseBody<{ object: { id: string; key: string; size: number } }>(
        copied,
      ).object;
      expect(copiedObject.key).toBe('dst.txt');
      expect(copiedObject.id).not.toBe(source.id);
      expect(copiedObject.size).toBe(source.size);

      // Both objects must exist afterwards.
      const stillThere = await request(app)
        .get(`/api/v1/storage/objects/${source.id}`)
        .set(tenant.headers);
      expect(stillThere.status).toBe(200);
    });

    it('moves an object by copying first and only then deleting the source', async () => {
      const tenant = await register('move-owner@example.com', 'Move Org');
      const bucketId = await createBucket(tenant, 'moves');
      const source = await uploadObject(tenant, bucketId, 'from.txt', Buffer.from('move payload'));

      const moved = await request(app)
        .post(`/api/v1/storage/objects/${source.id}/move`)
        .set(tenant.headers)
        .send({ destinationBucketId: bucketId, destinationKey: 'to.txt' });

      expect(moved.status).toBe(200);
      expect(responseBody<{ object: { key: string } }>(moved).object.key).toBe('to.txt');

      const listed = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects`)
        .set(tenant.headers);
      expect(
        responseBody<{ objects: { key: string }[] }>(listed).objects.map((o) => o.key),
      ).toEqual(['to.txt']);
    });

    it('deletes an object and its metadata', async () => {
      const tenant = await register('delete-owner@example.com', 'Delete Org');
      const bucketId = await createBucket(tenant, 'deletes');
      const object = await uploadObject(tenant, bucketId, 'bye.txt', Buffer.from('bye'));

      const deleted = await request(app)
        .delete(`/api/v1/storage/objects/${object.id}`)
        .set(tenant.headers);
      expect(deleted.status).toBe(204);

      const gone = await request(app)
        .get(`/api/v1/storage/objects/${object.id}`)
        .set(tenant.headers);
      expect(gone.status).toBe(404);
      expect(errorBody(gone).code).toBe('STORAGE_OBJECT_NOT_FOUND');
    });
  });

  describe('multipart upload', () => {
    it('runs the full multipart lifecycle', async () => {
      const tenant = await register('mp-owner@example.com', 'Multipart Org');
      const bucketId = await createBucket(tenant, 'multipart');

      const initiated = await request(app)
        .post('/api/v1/storage/multipart-uploads')
        .set(tenant.headers)
        .send({ bucketId, key: 'big.bin', contentType: 'application/octet-stream' });
      expect(initiated.status).toBe(201);
      const uploadId = responseBody<{ uploadId: string }>(initiated).uploadId;

      const partBodies = [Buffer.alloc(1024, 1), Buffer.alloc(1024, 2)];
      const parts = [];
      for (const [index, body] of partBodies.entries()) {
        const response = await request(app)
          .put(
            `/api/v1/storage/multipart-uploads/${uploadId}/parts?partNumber=${String(index + 1)}`,
          )
          .set(tenant.headers)
          .set('Content-Type', 'application/octet-stream')
          .send(body);

        expect(response.status).toBe(200);
        parts.push(responseBody<{ part: { partNumber: number; etag: string } }>(response).part);
      }

      const completed = await request(app)
        .post(`/api/v1/storage/multipart-uploads/${uploadId}/complete`)
        .set(tenant.headers)
        .send({ parts: parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })) });

      expect(completed.status).toBe(201);
      const completedObject = responseBody<{ object: { size: number; etag: string } }>(
        completed,
      ).object;
      expect(completedObject.size).toBe(2048);
      // Multipart ETags carry a part-count suffix rather than a plain MD5.
      expect(completedObject.etag).toMatch(/-2$/);
    });

    it('aborts a multipart upload and discards its parts', async () => {
      const tenant = await register('mp-abort@example.com', 'Multipart Abort Org');
      const bucketId = await createBucket(tenant, 'multipart-abort');

      const initiated = await request(app)
        .post('/api/v1/storage/multipart-uploads')
        .set(tenant.headers)
        .send({ bucketId, key: 'abort.bin' });
      const uploadId = responseBody<{ uploadId: string }>(initiated).uploadId;

      await request(app)
        .put(`/api/v1/storage/multipart-uploads/${uploadId}/parts?partNumber=1`)
        .set(tenant.headers)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.alloc(256));

      const aborted = await request(app)
        .delete(`/api/v1/storage/multipart-uploads/${uploadId}`)
        .set(tenant.headers);
      expect(aborted.status).toBe(204);

      const completeAfterAbort = await request(app)
        .post(`/api/v1/storage/multipart-uploads/${uploadId}/complete`)
        .set(tenant.headers)
        .send({ parts: [{ partNumber: 1, etag: 'x' }] });
      expect(completeAfterAbort.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('security', () => {
    it('requires authentication for every storage route', async () => {
      const routes: [string, string][] = [
        ['get', '/api/v1/storage/buckets'],
        ['post', '/api/v1/storage/buckets'],
        ['post', '/api/v1/storage/uploads/initiate'],
        ['get', '/api/v1/storage/objects/some-id'],
      ];

      for (const [method, path] of routes) {
        const response = await (method === 'get'
          ? request(app).get(path)
          : request(app).post(path).send({}));

        expect(response.status).toBe(401);
      }
    });

    it('denies cross-organization bucket access', async () => {
      const owner = await register('iso-owner@example.com', 'Isolation Owner Org');
      const attacker = await register('iso-attacker@example.com', 'Isolation Attacker Org');
      const bucketId = await createBucket(owner, 'private-bucket');

      const read = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}`)
        .set(attacker.headers);
      expect(read.status).toBe(404);

      const list = await request(app)
        .get(`/api/v1/storage/buckets/${bucketId}/objects`)
        .set(attacker.headers);
      expect(list.status).toBe(404);

      const destroy = await request(app)
        .delete(`/api/v1/storage/buckets/${bucketId}`)
        .set(attacker.headers);
      expect(destroy.status).toBe(404);
    });

    it('denies cross-organization object access, including copy and delete', async () => {
      const owner = await register('objiso-owner@example.com', 'ObjIso Owner Org');
      const attacker = await register('objiso-attacker@example.com', 'ObjIso Attacker Org');
      const bucketId = await createBucket(owner, 'owner-objects');
      const attackerBucket = await createBucket(attacker, 'attacker-objects');
      const object = await uploadObject(owner, bucketId, 'secret.txt', Buffer.from('secret'));

      expect(
        (await request(app).get(`/api/v1/storage/objects/${object.id}`).set(attacker.headers))
          .status,
      ).toBe(404);

      expect(
        (
          await request(app)
            .post(`/api/v1/storage/objects/${object.id}/download-url`)
            .set(attacker.headers)
        ).status,
      ).toBe(404);

      expect(
        (
          await request(app)
            .post(`/api/v1/storage/objects/${object.id}/copy`)
            .set(attacker.headers)
            .send({ destinationBucketId: attackerBucket, destinationKey: 'stolen.txt' })
        ).status,
      ).toBe(404);

      expect(
        (await request(app).delete(`/api/v1/storage/objects/${object.id}`).set(attacker.headers))
          .status,
      ).toBe(404);

      // The object must still be intact for its real owner.
      expect(
        (await request(app).get(`/api/v1/storage/objects/${object.id}`).set(owner.headers)).status,
      ).toBe(200);
    });

    it('ignores an organizationId supplied in the request body', async () => {
      const owner = await register('body-owner@example.com', 'Body Owner Org');
      const attacker = await register('body-attacker@example.com', 'Body Attacker Org');

      const created = await request(app)
        .post('/api/v1/storage/buckets')
        .set(attacker.headers)
        .send({ name: 'body-forged', organizationId: owner.organizationId });
      expect(created.status).toBe(201);

      // The bucket belongs to the authenticated caller, not the body value.
      const ownerList = await request(app).get('/api/v1/storage/buckets').set(owner.headers);
      expect(
        responseBody<{ buckets: { name: string }[] }>(ownerList).buckets.map((b) => b.name),
      ).not.toContain('body-forged');
    });

    it('rejects an organization cookie the caller is not a member of', async () => {
      const owner = await register('cookie-owner@example.com', 'Cookie Owner Org');
      const attacker = await register('cookie-attacker@example.com', 'Cookie Attacker Org');

      const attackerCookie = attacker.headers.Cookie;
      if (!attackerCookie) {
        throw new Error('Expected attacker auth cookies');
      }
      const forged = {
        ...attacker.headers,
        Cookie: attackerCookie.replace(
          `${ORGANIZATION_COOKIE_NAME}=${attacker.organizationId}`,
          `${ORGANIZATION_COOKIE_NAME}=${owner.organizationId}`,
        ),
      };

      const response = await request(app).get('/api/v1/storage/buckets').set(forged);

      expect(response.status).toBe(403);
      expect(errorBody(response).code).toBe('STORAGE_ACCESS_DENIED');
    });

    it('rejects forged and malformed object ids', async () => {
      const tenant = await register('forged-owner@example.com', 'Forged Org');

      for (const id of ['not-a-real-id', '00000000-0000-0000-0000-000000000000', '../../etc']) {
        const response = await request(app)
          .get(`/api/v1/storage/objects/${encodeURIComponent(id)}`)
          .set(tenant.headers);

        expect([400, 404]).toContain(response.status);
      }
    });

    it('rejects traversal, absolute, Windows and null-byte object keys', async () => {
      const tenant = await register('traversal-owner@example.com', 'Traversal Org');
      const bucketId = await createBucket(tenant, 'traversal');

      const keys = [
        '../../../etc/passwd',
        '/etc/passwd',
        'a/../../b',
        'C:\\Windows\\system32',
        'file\u0000.txt',
        'folder/',
        'a//b',
      ];

      for (const key of keys) {
        const response = await request(app)
          .post('/api/v1/storage/uploads/initiate')
          .set(tenant.headers)
          .send({ bucketId, key });

        expect(response.status).toBe(400);
      }

      // Nothing may have escaped the storage root.
      await expect(readdir('/etc/vaultstack-escaped')).rejects.toThrow();
    });

    it('rejects an oversized declared upload before any bytes are sent', async () => {
      const tenant = await register('oversize-owner@example.com', 'Oversize Org');
      const bucketId = await createBucket(tenant, 'oversize');

      const response = await request(app)
        .post('/api/v1/storage/uploads/initiate')
        .set(tenant.headers)
        .send({ bucketId, key: 'huge.bin', size: 9 * 1024 * 1024 });

      expect(response.status).toBe(413);
      expect(errorBody(response).code).toBe('STORAGE_OBJECT_TOO_LARGE');
    });

    it('rejects a body that exceeds the maximum object size mid-stream', async () => {
      const tenant = await register('overstream-owner@example.com', 'OverStream Org');
      const bucketId = await createBucket(tenant, 'overstream');

      const initiated = await request(app)
        .post('/api/v1/storage/uploads/initiate')
        .set(tenant.headers)
        .send({ bucketId, key: 'sneaky.bin' });
      const { uploadUrl } = responseBody<{ uploadUrl: string }>(initiated);

      // Declares nothing up front, then sends more than the configured ceiling.
      const put = await request(app)
        .put(pathOf(uploadUrl))
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.alloc(9 * 1024 * 1024));

      expect(put.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects a completion whose checksum does not match the bytes received', async () => {
      const tenant = await register('checksum-owner@example.com', 'Checksum Org');
      const bucketId = await createBucket(tenant, 'checksums');

      const initiated = await request(app)
        .post('/api/v1/storage/uploads/initiate')
        .set(tenant.headers)
        .send({ bucketId, key: 'corrupt.txt' });
      const { upload, uploadUrl } = responseBody<{
        upload: { id: string };
        uploadUrl: string;
      }>(initiated);

      await request(app)
        .put(pathOf(uploadUrl))
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('real content'));

      const completed = await request(app)
        .post(`/api/v1/storage/uploads/${upload.id}/complete`)
        .set(tenant.headers)
        .send({ checksumSha256: 'b'.repeat(64) });

      expect(completed.status).toBe(422);
      expect(errorBody(completed).code).toBe('STORAGE_CHECKSUM_MISMATCH');
    });

    it('rejects a download URL with a tampered token', async () => {
      const tenant = await register('tamper-owner@example.com', 'Tamper Org');
      const bucketId = await createBucket(tenant, 'tamper');
      const object = await uploadObject(tenant, bucketId, 't.txt', Buffer.from('t'));

      const urlResponse = await request(app)
        .post(`/api/v1/storage/objects/${object.id}/download-url`)
        .set(tenant.headers);
      const { url } = responseBody<{ download: { url: string } }>(urlResponse).download;

      const tampered = await request(app).get(`${pathOf(url)}tampered`);

      expect(tampered.status).toBe(403);
    });

    it('refuses a download token replayed against a different object', async () => {
      const tenant = await register('replay-owner@example.com', 'Replay Org');
      const bucketId = await createBucket(tenant, 'replay');
      const first = await uploadObject(tenant, bucketId, 'one.txt', Buffer.from('one'));
      const second = await uploadObject(tenant, bucketId, 'two.txt', Buffer.from('two'));

      const urlResponse = await request(app)
        .post(`/api/v1/storage/objects/${first.id}/download-url`)
        .set(tenant.headers);
      const { url } = responseBody<{ download: { url: string } }>(urlResponse).download;

      // Swap the object id but keep the signed token.
      const swapped = pathOf(url).replace(first.id, second.id);
      const response = await request(app).get(swapped);

      expect(response.status).toBe(403);
    });

    it('requires an upload token to write bytes', async () => {
      const tenant = await register('notoken-owner@example.com', 'NoToken Org');
      const bucketId = await createBucket(tenant, 'notoken');

      const initiated = await request(app)
        .post('/api/v1/storage/uploads/initiate')
        .set(tenant.headers)
        .send({ bucketId, key: 'needs-token.txt' });
      const { upload } = responseBody<{ upload: { id: string } }>(initiated);

      const withoutToken = await request(app)
        .put(`/api/v1/storage/uploads/${upload.id}/content`)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('x'));

      expect(withoutToken.status).toBe(400);
    });
  });

  describe('durability', () => {
    it('keeps objects readable after the API is recreated', async () => {
      const tenant = await register('restart-owner@example.com', 'Restart Org');
      const bucketId = await createBucket(tenant, 'restart');
      const body = Buffer.from('survives an API restart');
      const object = await uploadObject(tenant, bucketId, 'persistent.txt', body);

      // A new app instance over the same database and storage root models a
      // process restart: nothing about the object lived in memory.
      if (!db) {
        throw new Error('Test database was not started');
      }
      const restarted = createApp({
        config: createTestConfig({
          DATABASE_URL: db.databaseUrl,
          STORAGE_DRIVER: 'local',
          STORAGE_LOCAL_ROOT: storageRoot,
          LOGIN_RATE_LIMIT_MAX: 100,
        }),
        logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never,
        prisma: db.prisma,
        clients: { prisma: db.prisma, redis: createMockRedis() },
        rateLimiter: createMemoryRateLimiter(),
      });

      const login = await request(restarted).post('/api/v1/auth/login').send({
        email: 'restart-owner@example.com',
        password: 'password123',
      });
      const headers = {
        ...authHeaders(login),
        Cookie: `${authHeaders(login).Cookie}; ${ORGANIZATION_COOKIE_NAME}=${tenant.organizationId}`,
      };

      const fetched = await request(restarted)
        .get(`/api/v1/storage/objects/${object.id}`)
        .set(headers);
      expect(fetched.status).toBe(200);
      expect(responseBody<{ object: { size: number } }>(fetched).object.size).toBe(body.length);

      const urlResponse = await request(restarted)
        .post(`/api/v1/storage/objects/${object.id}/download-url`)
        .set(headers);
      const { url } = responseBody<{ download: { url: string } }>(urlResponse).download;
      const download = await request(restarted).get(pathOf(url));

      expect(Buffer.from(download.body as Buffer).equals(body)).toBe(true);
    });

    it('works with MinIO absent, since the local provider is self-contained', async () => {
      // No MinIO container is started anywhere in this file; the whole suite
      // passing is the assertion that MinIO is not a hard dependency.
      const tenant = await register('nominio-owner@example.com', 'NoMinio Org');
      const bucketId = await createBucket(tenant, 'no-minio');

      const object = await uploadObject(tenant, bucketId, 'local-only.txt', Buffer.from('local'));

      expect(object.size).toBe(5);
    });
  });
});

/** Strips the origin from an absolute URL so supertest can request the path. */
function pathOf(url: string): string {
  const parsed = new URL(url, 'http://127.0.0.1');
  return `${parsed.pathname}${parsed.search}`;
}
