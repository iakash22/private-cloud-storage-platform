import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../../lib/errors.js';
import type { StorageProvider } from '../../domain/storage-provider.js';
import type { StorageLocation } from '../../domain/storage.types.js';
import { createLocalFilesystemProvider } from './local-filesystem.provider.js';

const MAX_SIZE = 64 * 1024 * 1024;
const BUCKET = 'vs-bucket-1';

function location(physicalKey: string): StorageLocation {
  return { physicalBucket: BUCKET, physicalKey };
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

describe('LocalFilesystemStorageProvider', () => {
  let root: string;
  let provider: StorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vaultstack-localfs-'));
    provider = createLocalFilesystemProvider({ root });
    await provider.createBucket({ physicalBucket: BUCKET });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('capabilities', () => {
    it('does not claim native presigning, versioning or server-side copy', () => {
      expect(provider.capabilities).toEqual({
        nativePresignedUrls: false,
        nativeVersioning: false,
        serverSideCopy: false,
      });
    });

    it('reports itself as the local filesystem provider', () => {
      expect(provider.type).toBe('LOCAL_FILESYSTEM');
    });
  });

  describe('buckets', () => {
    it('creates, gets, lists and deletes buckets', async () => {
      await provider.createBucket({ physicalBucket: 'vs-bucket-2' });

      const listed = (await provider.listBuckets()).map((bucket) => bucket.physicalBucket);
      expect(listed).toEqual(expect.arrayContaining([BUCKET, 'vs-bucket-2']));

      expect(await provider.getBucket({ physicalBucket: 'vs-bucket-2' })).not.toBeNull();

      await provider.deleteBucket({ physicalBucket: 'vs-bucket-2' });
      expect(await provider.getBucket({ physicalBucket: 'vs-bucket-2' })).toBeNull();
    });

    it('returns null for a bucket that does not exist', async () => {
      expect(await provider.getBucket({ physicalBucket: 'vs-missing' })).toBeNull();
    });

    it('is idempotent when creating an existing bucket', async () => {
      await expect(provider.createBucket({ physicalBucket: BUCKET })).resolves.toBeUndefined();
    });
  });

  describe('putObject', () => {
    it('writes bytes to disk and returns size, ETag and checksum', async () => {
      const body = Buffer.from('hello vaultstack');

      const result = await provider.putObject({
        ...location('org-1/ab/obj-1/ver-1'),
        body: Readable.from([body]),
        contentType: 'text/plain',
        maxSizeBytes: MAX_SIZE,
      });

      expect(result.size).toBe(body.length);
      expect(result.etag).toBe(createHash('md5').update(body).digest('hex'));
      expect(result.checksum).toEqual({
        algorithm: 'SHA256',
        value: createHash('sha256').update(body).digest('hex'),
      });
      expect(result.contentType).toBe('text/plain');
    });

    it('stores the bytes at a server-generated path inside the storage root', async () => {
      const body = Buffer.from('on disk');
      await provider.putObject({
        ...location('org-1/ab/obj-1/ver-1'),
        body: Readable.from([body]),
        maxSizeBytes: MAX_SIZE,
      });

      // Verifies real bytes exist on the filesystem, not just metadata.
      const dataPath = join(root, 'objects', BUCKET, 'org-1/ab/obj-1/ver-1', 'data');
      expect((await readFile(dataPath)).equals(body)).toBe(true);
    });

    it('defaults the content type when the caller does not supply one', async () => {
      const result = await provider.putObject({
        ...location('org-1/ab/obj-1/ver-1'),
        body: Readable.from([Buffer.from('x')]),
        maxSizeBytes: MAX_SIZE,
      });

      expect(result.contentType).toBe('application/octet-stream');
    });

    it('stores an empty object', async () => {
      const result = await provider.putObject({
        ...location('org-1/ab/obj-empty/ver-1'),
        body: Readable.from([]),
        maxSizeBytes: MAX_SIZE,
      });

      expect(result.size).toBe(0);

      const head = await provider.headObject(location('org-1/ab/obj-empty/ver-1'));
      expect(head?.size).toBe(0);
    });

    it('rejects an object larger than the configured ceiling', async () => {
      await expect(
        provider.putObject({
          ...location('org-1/ab/obj-big/ver-1'),
          body: Readable.from([Buffer.alloc(2048)]),
          maxSizeBytes: 1024,
        }),
      ).rejects.toThrow(AppError);
    });

    it('leaves no staged file behind after an oversized upload', async () => {
      await provider
        .putObject({
          ...location('org-1/ab/obj-big/ver-1'),
          body: Readable.from([Buffer.alloc(2048)]),
          maxSizeBytes: 1024,
        })
        .catch(() => undefined);

      await expect(
        stat(join(root, 'objects', BUCKET, 'org-1/ab/obj-big/ver-1', 'data')),
      ).rejects.toThrow();
      expect(await tempEntries(root)).toEqual([]);
    });

    it('rejects a size mismatch against the caller expectation', async () => {
      await expect(
        provider.putObject({
          ...location('org-1/ab/obj-1/ver-1'),
          body: Readable.from([Buffer.from('four')]),
          maxSizeBytes: MAX_SIZE,
          expect: { size: 99 },
        }),
      ).rejects.toThrow(AppError);
    });

    it('rejects a checksum mismatch rather than silently accepting corruption', async () => {
      await expect(
        provider.putObject({
          ...location('org-1/ab/obj-1/ver-1'),
          body: Readable.from([Buffer.from('payload')]),
          maxSizeBytes: MAX_SIZE,
          expect: { checksum: { algorithm: 'SHA256', value: 'a'.repeat(64) } },
        }),
      ).rejects.toThrow(AppError);
    });

    it('accepts a matching checksum expectation', async () => {
      const body = Buffer.from('payload');

      await expect(
        provider.putObject({
          ...location('org-1/ab/obj-1/ver-1'),
          body: Readable.from([body]),
          maxSizeBytes: MAX_SIZE,
          expect: {
            size: body.length,
            checksum: {
              algorithm: 'SHA256',
              value: createHash('sha256').update(body).digest('hex'),
            },
          },
        }),
      ).resolves.toMatchObject({ size: body.length });
    });

    it('does not publish the object when the write is aborted mid-stream', async () => {
      const controller = new AbortController();
      const body = new Readable({
        read() {
          this.push(Buffer.alloc(1024));
          controller.abort();
        },
      });

      await provider
        .putObject({
          ...location('org-1/ab/obj-abort/ver-1'),
          body,
          maxSizeBytes: MAX_SIZE,
          signal: controller.signal,
        })
        .catch(() => undefined);

      expect(await provider.headObject(location('org-1/ab/obj-abort/ver-1'))).toBeNull();
      expect(await tempEntries(root)).toEqual([]);
    });

    it('replaces an existing physical object atomically', async () => {
      const target = location('org-1/ab/obj-1/ver-1');
      await provider.putObject({
        ...target,
        body: Readable.from([Buffer.from('first')]),
        maxSizeBytes: MAX_SIZE,
      });
      await provider.putObject({
        ...target,
        body: Readable.from([Buffer.from('second')]),
        maxSizeBytes: MAX_SIZE,
      });

      const { body } = await provider.getObject(target);
      expect((await collect(body)).toString()).toBe('second');
    });
  });

  describe('getObject', () => {
    const target = location('org-1/ab/obj-1/ver-1');
    const payload = Buffer.from('0123456789');

    beforeEach(async () => {
      await provider.putObject({
        ...target,
        body: Readable.from([payload]),
        contentType: 'application/pdf',
        maxSizeBytes: MAX_SIZE,
      });
    });

    it('streams the whole object with its metadata', async () => {
      const result = await provider.getObject(target);

      expect(result.size).toBe(payload.length);
      expect(result.contentType).toBe('application/pdf');
      expect(result.etag).toBe(createHash('md5').update(payload).digest('hex'));
      expect(result.lastModified).toBeInstanceOf(Date);
      expect((await collect(result.body)).equals(payload)).toBe(true);
    });

    it('serves a byte range', async () => {
      const result = await provider.getObject({ ...target, range: { start: 2, end: 5 } });

      expect(result.size).toBe(4);
      expect(result.contentRange).toBe(`bytes 2-5/${payload.length}`);
      expect((await collect(result.body)).toString()).toBe('2345');
    });

    it('serves an open-ended range', async () => {
      const result = await provider.getObject({ ...target, range: { start: 7 } });

      expect(result.contentRange).toBe(`bytes 7-9/${payload.length}`);
      expect((await collect(result.body)).toString()).toBe('789');
    });

    it('clamps a range end past the object size', async () => {
      const result = await provider.getObject({ ...target, range: { start: 8, end: 999 } });

      expect((await collect(result.body)).toString()).toBe('89');
    });

    it('rejects a range that starts past the end of the object', async () => {
      await expect(provider.getObject({ ...target, range: { start: 50 } })).rejects.toThrow(
        AppError,
      );
    });

    it('reports a missing object as STORAGE_OBJECT_NOT_FOUND', async () => {
      try {
        await provider.getObject(location('org-1/ab/missing/ver-1'));
        throw new Error('expected rejection');
      } catch (error) {
        expect((error as AppError).code).toBe('STORAGE_OBJECT_NOT_FOUND');
      }
    });
  });

  describe('headObject', () => {
    it('returns metadata without the body, including custom metadata', async () => {
      const target = location('org-1/ab/obj-1/ver-1');
      await provider.putObject({
        ...target,
        body: Readable.from([Buffer.from('abc')]),
        contentType: 'text/plain',
        metadata: { owner: 'team-a' },
        maxSizeBytes: MAX_SIZE,
      });

      const head = await provider.headObject(target);

      expect(head).toMatchObject({
        size: 3,
        contentType: 'text/plain',
        metadata: { owner: 'team-a' },
      });
    });

    it('returns null rather than throwing for a missing object', async () => {
      expect(await provider.headObject(location('org-1/ab/nope/ver-1'))).toBeNull();
    });
  });

  describe('deleteObject', () => {
    it('removes the bytes from disk', async () => {
      const target = location('org-1/ab/obj-1/ver-1');
      await provider.putObject({
        ...target,
        body: Readable.from([Buffer.from('bye')]),
        maxSizeBytes: MAX_SIZE,
      });

      await provider.deleteObject(target);

      expect(await provider.headObject(target)).toBeNull();
      await expect(
        stat(join(root, 'objects', BUCKET, 'org-1/ab/obj-1/ver-1', 'data')),
      ).rejects.toThrow();
    });

    it('is idempotent for an object that is already gone', async () => {
      await expect(
        provider.deleteObject(location('org-1/ab/never-existed/ver-1')),
      ).resolves.toBeUndefined();
    });
  });

  describe('copyObject', () => {
    it('copies bytes and metadata to a new physical location', async () => {
      const source = location('org-1/ab/obj-1/ver-1');
      const destination = location('org-1/cd/obj-2/ver-1');
      const payload = Buffer.from('copy me');

      await provider.putObject({
        ...source,
        body: Readable.from([payload]),
        contentType: 'text/plain',
        maxSizeBytes: MAX_SIZE,
      });

      const result = await provider.copyObject({ source, destination });

      expect(result.size).toBe(payload.length);
      expect(result.etag).toBe(createHash('md5').update(payload).digest('hex'));

      // The source must survive: "move" is copy-then-delete at the service layer.
      expect(await provider.headObject(source)).not.toBeNull();
      const copied = await provider.getObject(destination);
      expect((await collect(copied.body)).equals(payload)).toBe(true);
    });

    it('fails when the source does not exist', async () => {
      await expect(
        provider.copyObject({
          source: location('org-1/ab/missing/ver-1'),
          destination: location('org-1/cd/obj-2/ver-1'),
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('listObjects', () => {
    beforeEach(async () => {
      for (const key of ['org-1/ab/obj-1/ver-1', 'org-1/ab/obj-2/ver-1', 'org-1/cd/obj-3/ver-1']) {
        await provider.putObject({
          ...location(key),
          body: Readable.from([Buffer.from(key)]),
          maxSizeBytes: MAX_SIZE,
        });
      }
    });

    it('walks the fan-out layout and finds every object', async () => {
      const page = await provider.listObjects({ physicalBucket: BUCKET, maxKeys: 100 });

      expect(page.objects.map((object) => object.physicalKey).sort()).toEqual([
        'org-1/ab/obj-1/ver-1',
        'org-1/ab/obj-2/ver-1',
        'org-1/cd/obj-3/ver-1',
      ]);
      expect(page.isTruncated).toBe(false);
    });

    it('filters by prefix', async () => {
      const page = await provider.listObjects({
        physicalBucket: BUCKET,
        prefix: 'org-1/ab/',
        maxKeys: 100,
      });

      expect(page.objects).toHaveLength(2);
    });

    it('paginates with a continuation cursor', async () => {
      const first = await provider.listObjects({ physicalBucket: BUCKET, maxKeys: 2 });
      expect(first.objects).toHaveLength(2);
      expect(first.isTruncated).toBe(true);
      expect(first.nextCursor).not.toBeNull();

      const second = await provider.listObjects({
        physicalBucket: BUCKET,
        maxKeys: 2,
        ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
      });

      expect(second.objects).toHaveLength(1);
      expect(second.isTruncated).toBe(false);
    });

    it('collapses keys into common prefixes when a delimiter is given', async () => {
      const page = await provider.listObjects({
        physicalBucket: BUCKET,
        prefix: 'org-1/',
        delimiter: '/',
        maxKeys: 100,
      });

      expect(page.prefixes).toEqual(['org-1/ab/', 'org-1/cd/']);
      expect(page.objects).toEqual([]);
    });

    it('returns an empty page for a bucket with no objects', async () => {
      await provider.createBucket({ physicalBucket: 'vs-empty' });

      const page = await provider.listObjects({ physicalBucket: 'vs-empty', maxKeys: 100 });

      expect(page.objects).toEqual([]);
      expect(page.isTruncated).toBe(false);
    });
  });

  describe('multipart upload', () => {
    const target = location('org-1/ab/obj-mp/ver-1');

    it('assembles parts in order and returns a multipart ETag', async () => {
      const { providerUploadId } = await provider.initiateMultipartUpload({
        ...target,
        contentType: 'application/octet-stream',
      });

      const partBodies = [Buffer.alloc(1024, 1), Buffer.alloc(1024, 2), Buffer.from('tail')];
      const parts = [];
      for (const [index, body] of partBodies.entries()) {
        parts.push(
          await provider.uploadPart({
            ...target,
            providerUploadId,
            partNumber: index + 1,
            body: Readable.from([body]),
            maxSizeBytes: MAX_SIZE,
          }),
        );
      }

      const result = await provider.completeMultipartUpload({
        ...target,
        providerUploadId,
        parts: parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag })),
      });

      const expected = Buffer.concat(partBodies);
      expect(result.size).toBe(expected.length);
      // A multipart ETag is the digest-of-digests plus a part count, not a
      // plain MD5 of the assembled object.
      expect(result.etag).toMatch(/^[a-f0-9]{32}-3$/);
      expect(result.etag).not.toBe(createHash('md5').update(expected).digest('hex'));

      const { body } = await provider.getObject(target);
      expect((await collect(body)).equals(expected)).toBe(true);
    });

    it('assembles parts correctly even when they are uploaded out of order', async () => {
      const { providerUploadId } = await provider.initiateMultipartUpload({ ...target });

      const second = Buffer.from('SECOND');
      const first = Buffer.from('FIRST');

      await provider.uploadPart({
        ...target,
        providerUploadId,
        partNumber: 2,
        body: Readable.from([second]),
        maxSizeBytes: MAX_SIZE,
      });
      await provider.uploadPart({
        ...target,
        providerUploadId,
        partNumber: 1,
        body: Readable.from([first]),
        maxSizeBytes: MAX_SIZE,
      });

      await provider.completeMultipartUpload({
        ...target,
        providerUploadId,
        parts: [
          { partNumber: 1, etag: 'ignored' },
          { partNumber: 2, etag: 'ignored' },
        ],
      });

      const { body } = await provider.getObject(target);
      expect((await collect(body)).toString()).toBe('FIRSTSECOND');
    });

    it('rejects completion that references a part that was never uploaded', async () => {
      const { providerUploadId } = await provider.initiateMultipartUpload({ ...target });
      await provider.uploadPart({
        ...target,
        providerUploadId,
        partNumber: 1,
        body: Readable.from([Buffer.from('a')]),
        maxSizeBytes: MAX_SIZE,
      });

      await expect(
        provider.completeMultipartUpload({
          ...target,
          providerUploadId,
          parts: [
            { partNumber: 1, etag: 'x' },
            { partNumber: 7, etag: 'x' },
          ],
        }),
      ).rejects.toThrow(AppError);
    });

    it('discards staged parts on abort and leaves no object behind', async () => {
      const { providerUploadId } = await provider.initiateMultipartUpload({ ...target });
      await provider.uploadPart({
        ...target,
        providerUploadId,
        partNumber: 1,
        body: Readable.from([Buffer.alloc(512)]),
        maxSizeBytes: MAX_SIZE,
      });

      await provider.abortMultipartUpload({ ...target, providerUploadId });

      expect(await provider.headObject(target)).toBeNull();
      await expect(stat(join(root, 'multipart', providerUploadId))).rejects.toThrow();
    });

    it('removes staged parts once the upload completes', async () => {
      const { providerUploadId } = await provider.initiateMultipartUpload({ ...target });
      await provider.uploadPart({
        ...target,
        providerUploadId,
        partNumber: 1,
        body: Readable.from([Buffer.from('done')]),
        maxSizeBytes: MAX_SIZE,
      });
      await provider.completeMultipartUpload({
        ...target,
        providerUploadId,
        parts: [{ partNumber: 1, etag: 'x' }],
      });

      await expect(stat(join(root, 'multipart', providerUploadId))).rejects.toThrow();
    });

    it('reports an unknown upload id as a multipart error', async () => {
      await expect(
        provider.completeMultipartUpload({
          ...target,
          providerUploadId: 'does-not-exist',
          parts: [{ partNumber: 1, etag: 'x' }],
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('presigned URLs', () => {
    it('refuses to mint URLs itself, since it has no credential to sign with', async () => {
      // The service layer issues VaultStack-signed URLs for this provider
      // instead; nativePresignedUrls is false to express exactly that.
      await expect(
        provider.createPresignedDownloadUrl({
          ...location('org-1/ab/obj-1/ver-1'),
          expiresInSeconds: 60,
        }),
      ).rejects.toThrow(AppError);

      await expect(
        provider.createPresignedUploadUrl({
          ...location('org-1/ab/obj-1/ver-1'),
          expiresInSeconds: 60,
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('durability and concurrency', () => {
    it('keeps objects readable through a provider restart', async () => {
      const target = location('org-1/ab/obj-1/ver-1');
      const payload = Buffer.from('survives restart');
      await provider.putObject({
        ...target,
        body: Readable.from([payload]),
        maxSizeBytes: MAX_SIZE,
      });

      // A fresh provider instance models an API process restart: state lives
      // on disk, not in memory.
      const restarted = createLocalFilesystemProvider({ root });

      const result = await restarted.getObject(target);
      expect((await collect(result.body)).equals(payload)).toBe(true);
    });

    it('handles concurrent writes to distinct objects', async () => {
      const keys = Array.from({ length: 12 }, (_unused, index) => `org-1/ab/obj-${index}/ver-1`);

      const results = await Promise.all(
        keys.map((key) =>
          provider.putObject({
            ...location(key),
            body: Readable.from([Buffer.from(key)]),
            maxSizeBytes: MAX_SIZE,
          }),
        ),
      );

      expect(results).toHaveLength(keys.length);
      for (const key of keys) {
        const head = await provider.headObject(location(key));
        expect(head?.size).toBe(Buffer.byteLength(key));
      }
    });

    it('leaves exactly one winner after concurrent writes to the same object', async () => {
      const target = location('org-1/ab/contended/ver-1');
      const payloads = ['aaaa', 'bbbb', 'cccc'];

      await Promise.all(
        payloads.map((payload) =>
          provider.putObject({
            ...target,
            body: Readable.from([Buffer.from(payload)]),
            maxSizeBytes: MAX_SIZE,
          }),
        ),
      );

      // Writes stage to temp and rename into place, so the object must be one
      // of the payloads rather than a torn mixture of them.
      const { body } = await provider.getObject(target);
      expect(payloads).toContain((await collect(body)).toString());
      expect(await tempEntries(root)).toEqual([]);
    });

    it('streams a large object without buffering it in memory', async () => {
      const target = location('org-1/ab/obj-large/ver-1');
      const chunk = Buffer.alloc(1024 * 1024, 9);
      const chunkCount = 32;

      const source = Readable.from(
        (function* generate() {
          for (let index = 0; index < chunkCount; index += 1) {
            yield chunk;
          }
        })(),
      );

      const before = process.memoryUsage().heapUsed;
      const result = await provider.putObject({
        ...target,
        body: source,
        maxSizeBytes: MAX_SIZE,
      });
      const growth = process.memoryUsage().heapUsed - before;

      expect(result.size).toBe(chunk.length * chunkCount);
      // 32 MiB written; heap growth must stay far below the object size.
      expect(growth).toBeLessThan(result.size / 2);

      let downloaded = 0;
      const { body } = await provider.getObject(target);
      await pipeline(body, async function count(stream) {
        for await (const part of stream) {
          downloaded += (part as Buffer).length;
        }
      });
      expect(downloaded).toBe(result.size);
    });
  });

  describe('healthCheck', () => {
    it('reports healthy when the storage root is writable', async () => {
      await expect(provider.healthCheck()).resolves.toMatchObject({ ok: true });
    });

    it('recreates a missing storage root rather than failing', async () => {
      // A fresh deployment points at an empty volume, so the provider is
      // expected to lay out its own directories.
      await rm(root, { recursive: true, force: true });

      await expect(provider.healthCheck()).resolves.toMatchObject({ ok: true });
    });

    it('reports unhealthy when the storage root cannot be created', async () => {
      // The parent is a regular file, so every mkdir beneath it fails with
      // ENOTDIR regardless of the user the tests run as.
      const blocker = join(root, 'not-a-directory');
      await writeFile(blocker, 'x');

      const unusable = createLocalFilesystemProvider({ root: join(blocker, 'data') });

      await expect(unusable.healthCheck()).resolves.toMatchObject({ ok: false });
    });
  });

  describe('path containment', () => {
    it('refuses physical keys that try to traverse out of the bucket', async () => {
      for (const key of ['../../../etc/passwd', '..', 'a/../../..']) {
        await expect(
          provider.putObject({
            ...location(key),
            body: Readable.from([Buffer.from('x')]),
            maxSizeBytes: MAX_SIZE,
          }),
        ).rejects.toThrow(AppError);
      }
    });

    it('refuses an absolute physical bucket that would escape the root', async () => {
      await expect(
        provider.putObject({
          physicalBucket: '/etc',
          physicalKey: 'passwd',
          body: Readable.from([Buffer.from('x')]),
          maxSizeBytes: MAX_SIZE,
        }),
      ).rejects.toThrow(AppError);
    });
  });
});

/** Staging files left in temp/ indicate a cleanup bug after a failed write. */
async function tempEntries(root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  return readdir(join(root, 'temp')).catch(() => [] as string[]);
}
