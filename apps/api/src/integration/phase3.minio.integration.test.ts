import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { startTestMinio, type TestMinio } from '@vaultstack/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createS3Client } from '../integrations/minio/minio.client.js';
import { describeS3Connection } from '../integrations/minio/minio.config.js';
import { checkS3Endpoint } from '../integrations/minio/minio.health.js';
import type { StorageProvider } from '../modules/storage/domain/storage-provider.js';
import type { StorageLocation } from '../modules/storage/domain/storage.types.js';
import { createS3CompatibleProvider } from '../modules/storage/providers/s3-compatible/s3-compatible.provider.js';

const MAX_SIZE = 64 * 1024 * 1024;

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

/**
 * S3 compatibility is verified against a real MinIO container rather than a
 * mocked SDK, so the provider is exercised over the actual S3 wire protocol.
 *
 * MinIO is a test and development dependency only: nothing here is required for
 * the local filesystem provider to work.
 */
describe('Phase 3 S3-compatible provider (real MinIO)', () => {
  let minio: TestMinio | undefined;
  let provider: StorageProvider;
  let bucket: string;

  function location(key: string): StorageLocation {
    return { physicalBucket: bucket, physicalKey: key };
  }

  function requireMinio(): TestMinio {
    if (!minio) {
      throw new Error('MinIO was not started');
    }
    return minio;
  }

  beforeAll(async () => {
    minio = await startTestMinio();

    const client = createS3Client({
      endpoint: minio.endpoint,
      region: minio.region,
      accessKeyId: minio.accessKey,
      secretAccessKey: minio.secretKey,
      forcePathStyle: minio.forcePathStyle,
    });

    provider = createS3CompatibleProvider({ client, region: minio.region });

    bucket = `vs-test-${randomUUID().slice(0, 8)}`;
    await provider.createBucket({ physicalBucket: bucket });
  }, 180_000);

  afterAll(async () => {
    await minio?.stop();
  }, 60_000);

  it('reports a reachable endpoint as ok', async () => {
    const connection = requireMinio();
    const client = createS3Client({
      endpoint: connection.endpoint,
      region: connection.region,
      accessKeyId: connection.accessKey,
      secretAccessKey: connection.secretKey,
      forcePathStyle: true,
    });

    await expect(checkS3Endpoint(client)).resolves.toMatchObject({ name: 's3', status: 'ok' });
  });

  it('reports an unreachable endpoint as degraded rather than throwing', async () => {
    // S3 is a soft dependency: an unreachable endpoint must not fail readiness,
    // because local filesystem storage keeps working without it.
    const client = createS3Client({
      endpoint: 'http://127.0.0.1:1',
      region: 'us-east-1',
      accessKeyId: 'x',
      secretAccessKey: 'y',
      forcePathStyle: true,
    });

    await expect(checkS3Endpoint(client)).resolves.toMatchObject({ status: 'degraded' });
  });

  it('never includes credentials in a describable connection', () => {
    const connection = requireMinio();
    const described = describeS3Connection({
      endpoint: connection.endpoint,
      region: connection.region,
      accessKeyId: connection.accessKey,
      secretAccessKey: connection.secretKey,
      forcePathStyle: true,
    });

    expect(JSON.stringify(described)).not.toContain(connection.secretKey);
    expect(JSON.stringify(described)).not.toContain(connection.accessKey);
  });

  it('advertises native presigning and server-side copy', () => {
    expect(provider.capabilities.nativePresignedUrls).toBe(true);
    expect(provider.capabilities.serverSideCopy).toBe(true);
  });

  it('creates, gets, lists and deletes buckets', async () => {
    const extra = `vs-test-${randomUUID().slice(0, 8)}`;
    await provider.createBucket({ physicalBucket: extra });

    expect(await provider.getBucket({ physicalBucket: extra })).not.toBeNull();
    expect((await provider.listBuckets()).map((b) => b.physicalBucket)).toEqual(
      expect.arrayContaining([bucket, extra]),
    );

    await provider.deleteBucket({ physicalBucket: extra });
    expect(await provider.getBucket({ physicalBucket: extra })).toBeNull();
  });

  it('uploads and downloads an object with matching metadata', async () => {
    const key = 'docs/report.pdf';
    const body = Buffer.from('s3 compatible payload');

    const put = await provider.putObject({
      ...location(key),
      body: Readable.from([body]),
      contentType: 'application/pdf',
      maxSizeBytes: MAX_SIZE,
    });

    expect(put.size).toBe(body.length);
    expect(put.checksum.value).toBe(createHash('sha256').update(body).digest('hex'));

    const got = await provider.getObject(location(key));
    expect(got.contentType).toBe('application/pdf');
    expect((await collect(got.body)).equals(body)).toBe(true);
  });

  it('returns object metadata from headObject', async () => {
    const key = 'head/a.txt';
    await provider.putObject({
      ...location(key),
      body: Readable.from([Buffer.from('head me')]),
      contentType: 'text/plain',
      metadata: { owner: 'team-a' },
      maxSizeBytes: MAX_SIZE,
    });

    const head = await provider.headObject(location(key));

    expect(head).toMatchObject({ size: 7, contentType: 'text/plain' });
    expect(head?.metadata).toMatchObject({ owner: 'team-a' });
  });

  it('returns null from headObject for a missing key', async () => {
    expect(await provider.headObject(location('head/missing.txt'))).toBeNull();
  });

  it('serves a byte range', async () => {
    const key = 'range/r.txt';
    await provider.putObject({
      ...location(key),
      body: Readable.from([Buffer.from('0123456789')]),
      maxSizeBytes: MAX_SIZE,
    });

    const got = await provider.getObject({ ...location(key), range: { start: 2, end: 5 } });

    expect((await collect(got.body)).toString()).toBe('2345');
  });

  it('deletes an object', async () => {
    const key = 'delete/gone.txt';
    await provider.putObject({
      ...location(key),
      body: Readable.from([Buffer.from('bye')]),
      maxSizeBytes: MAX_SIZE,
    });

    await provider.deleteObject(location(key));

    expect(await provider.headObject(location(key))).toBeNull();
  });

  it('copies an object server-side and keeps the source', async () => {
    const source = location('copy/source.txt');
    const destination = location('copy/destination.txt');
    const body = Buffer.from('copy this');

    await provider.putObject({
      ...source,
      body: Readable.from([body]),
      maxSizeBytes: MAX_SIZE,
    });

    await provider.copyObject({ source, destination });

    expect(await provider.headObject(source)).not.toBeNull();
    const copied = await provider.getObject(destination);
    expect((await collect(copied.body)).equals(body)).toBe(true);
  });

  it('lists objects with a prefix and a delimiter', async () => {
    const listBucket = `vs-test-${randomUUID().slice(0, 8)}`;
    await provider.createBucket({ physicalBucket: listBucket });

    for (const key of ['a/1.txt', 'a/2.txt', 'b/3.txt']) {
      await provider.putObject({
        physicalBucket: listBucket,
        physicalKey: key,
        body: Readable.from([Buffer.from(key)]),
        maxSizeBytes: MAX_SIZE,
      });
    }

    const prefixed = await provider.listObjects({
      physicalBucket: listBucket,
      prefix: 'a/',
      maxKeys: 100,
    });
    expect(prefixed.objects.map((o) => o.physicalKey).sort()).toEqual(['a/1.txt', 'a/2.txt']);

    const folders = await provider.listObjects({
      physicalBucket: listBucket,
      delimiter: '/',
      maxKeys: 100,
    });
    expect(folders.prefixes.sort()).toEqual(['a/', 'b/']);
  });

  it('paginates listings with a continuation token', async () => {
    const pageBucket = `vs-test-${randomUUID().slice(0, 8)}`;
    await provider.createBucket({ physicalBucket: pageBucket });

    for (const index of [1, 2, 3]) {
      await provider.putObject({
        physicalBucket: pageBucket,
        physicalKey: `k-${String(index)}.txt`,
        body: Readable.from([Buffer.from('x')]),
        maxSizeBytes: MAX_SIZE,
      });
    }

    const first = await provider.listObjects({ physicalBucket: pageBucket, maxKeys: 2 });
    expect(first.objects).toHaveLength(2);
    expect(first.isTruncated).toBe(true);

    const second = await provider.listObjects({
      physicalBucket: pageBucket,
      maxKeys: 2,
      ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
    });
    expect(second.objects).toHaveLength(1);
  });

  it('runs a real multipart upload', async () => {
    const target = location('multipart/big.bin');
    const { providerUploadId } = await provider.initiateMultipartUpload({ ...target });

    // S3 requires every part except the last to be at least 5 MiB.
    const partBodies = [Buffer.alloc(5 * 1024 * 1024, 1), Buffer.from('tail')];
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
      parts: parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    });

    expect(result.size).toBe(5 * 1024 * 1024 + 4);
    // MinIO returns a part-count suffixed ETag, as real S3 does.
    expect(result.etag).toMatch(/-2$/);

    const got = await provider.getObject(target);
    expect(got.size).toBe(result.size);
  }, 120_000);

  it('aborts a multipart upload without publishing an object', async () => {
    const target = location('multipart/aborted.bin');
    const { providerUploadId } = await provider.initiateMultipartUpload({ ...target });

    await provider.uploadPart({
      ...target,
      providerUploadId,
      partNumber: 1,
      body: Readable.from([Buffer.alloc(5 * 1024 * 1024)]),
      maxSizeBytes: MAX_SIZE,
    });

    await provider.abortMultipartUpload({ ...target, providerUploadId });

    expect(await provider.headObject(target)).toBeNull();
  }, 120_000);

  it('issues a working presigned download URL', async () => {
    const key = 'presign/download.txt';
    const body = Buffer.from('presigned download');
    await provider.putObject({
      ...location(key),
      body: Readable.from([body]),
      maxSizeBytes: MAX_SIZE,
    });

    const presigned = await provider.createPresignedDownloadUrl({
      ...location(key),
      expiresInSeconds: 300,
    });

    expect(presigned.method).toBe('GET');
    // The signature is in the URL; the secret key itself must not be.
    expect(presigned.url).toContain('X-Amz-Signature');
    expect(presigned.url).not.toContain(requireMinio().secretKey);

    const response = await fetch(presigned.url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(body)).toBe(true);
  });

  it('issues a working presigned upload URL', async () => {
    const key = 'presign/upload.txt';
    const body = Buffer.from('presigned upload');

    const presigned = await provider.createPresignedUploadUrl({
      ...location(key),
      expiresInSeconds: 300,
    });

    expect(presigned.method).toBe('PUT');

    const uploaded = await fetch(presigned.url, { method: 'PUT', body });
    expect(uploaded.status).toBe(200);

    const head = await provider.headObject(location(key));
    expect(head?.size).toBe(body.length);
  });

  it('rejects an expired presigned URL', async () => {
    const key = 'presign/expired.txt';
    await provider.putObject({
      ...location(key),
      body: Readable.from([Buffer.from('expired')]),
      maxSizeBytes: MAX_SIZE,
    });

    const presigned = await provider.createPresignedDownloadUrl({
      ...location(key),
      expiresInSeconds: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 2_500));

    const response = await fetch(presigned.url);
    expect(response.status).toBe(403);
  });

  it('scopes a presigned URL to one object, so it grants no bucket-wide access', async () => {
    const allowed = 'presign/allowed.txt';
    const other = 'presign/other.txt';

    for (const key of [allowed, other]) {
      await provider.putObject({
        ...location(key),
        body: Readable.from([Buffer.from(key)]),
        maxSizeBytes: MAX_SIZE,
      });
    }

    const presigned = await provider.createPresignedDownloadUrl({
      ...location(allowed),
      expiresInSeconds: 300,
    });

    // Repointing the signed URL at another key invalidates the signature.
    const swapped = presigned.url.replace(encodeURIComponent(allowed), encodeURIComponent(other));
    const response = await fetch(swapped.replace(allowed, other));

    expect(response.status).toBe(403);
  });

  it('translates a missing object into STORAGE_OBJECT_NOT_FOUND', async () => {
    await provider.getObject(location('missing/nope.txt')).then(
      () => {
        throw new Error('expected rejection');
      },
      (error: unknown) => {
        // Raw AWS SDK errors must never reach the API surface.
        expect((error as { code?: string }).code).toBe('STORAGE_OBJECT_NOT_FOUND');
      },
    );
  });

  it('translates a missing bucket rather than leaking an SDK error', async () => {
    await provider.listObjects({ physicalBucket: 'vs-does-not-exist-anywhere', maxKeys: 10 }).then(
      () => {
        throw new Error('expected rejection');
      },
      (error: unknown) => {
        expect((error as { code?: string }).code).toBe('STORAGE_BUCKET_NOT_FOUND');
      },
    );
  });

  it('enforces the size ceiling on upload', async () => {
    await expect(
      provider.putObject({
        ...location('limits/too-big.bin'),
        body: Readable.from([Buffer.alloc(2048)]),
        maxSizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_OBJECT_TOO_LARGE' });
  });

  it('streams a large object without buffering it in memory', async () => {
    const target = location('large/streamed.bin');
    const chunk = Buffer.alloc(1024 * 1024, 3);
    const chunkCount = 24;

    const before = process.memoryUsage().heapUsed;
    const result = await provider.putObject({
      ...target,
      body: Readable.from(
        (function* generate() {
          for (let index = 0; index < chunkCount; index += 1) {
            yield chunk;
          }
        })(),
      ),
      maxSizeBytes: MAX_SIZE,
    });
    const growth = process.memoryUsage().heapUsed - before;

    expect(result.size).toBe(chunk.length * chunkCount);
    expect(growth).toBeLessThan(result.size);
  }, 120_000);
});
