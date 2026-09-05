import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { IntegrityMeter, ObjectTooLargeError, multipartEtag, normalizeEtag } from './integrity.js';

async function drain(source: Readable, meter: IntegrityMeter): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await pipeline(source, meter, async function collect(stream) {
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
  });
  return Buffer.concat(chunks);
}

describe('IntegrityMeter', () => {
  it('computes size, MD5 and SHA-256 while passing bytes through unchanged', async () => {
    const payload = Buffer.from('vaultstack storage engine');
    const meter = new IntegrityMeter(1_000);

    const passedThrough = await drain(Readable.from([payload]), meter);
    const totals = meter.totals();

    expect(passedThrough.equals(payload)).toBe(true);
    expect(totals.size).toBe(payload.length);
    expect(totals.md5).toBe(createHash('md5').update(payload).digest('hex'));
    expect(totals.sha256).toBe(createHash('sha256').update(payload).digest('hex'));
  });

  it('produces the same digests regardless of how the stream is chunked', async () => {
    const payload = Buffer.alloc(64 * 1024, 7);
    const single = new IntegrityMeter(1_000_000);
    const chunked = new IntegrityMeter(1_000_000);

    await drain(Readable.from([payload]), single);
    await drain(
      Readable.from(
        Array.from({ length: 64 }, (_unused, index) =>
          payload.subarray(index * 1024, (index + 1) * 1024),
        ),
      ),
      chunked,
    );

    expect(chunked.totals()).toEqual(single.totals());
  });

  it('handles an empty stream', async () => {
    const meter = new IntegrityMeter(1_000);
    await drain(Readable.from([]), meter);

    expect(meter.totals()).toEqual({
      size: 0,
      md5: createHash('md5').digest('hex'),
      sha256: createHash('sha256').digest('hex'),
    });
  });

  it('fails the stream as soon as the size limit is exceeded', async () => {
    const meter = new IntegrityMeter(10);

    await expect(drain(Readable.from([Buffer.alloc(11)]), meter)).rejects.toBeInstanceOf(
      ObjectTooLargeError,
    );
  });

  it('stops reading rather than buffering the whole oversized stream', async () => {
    const meter = new IntegrityMeter(4 * 1024);
    // 64 MiB of source data, but the meter must abort after ~4 KiB.
    const source = Readable.from(
      (function* chunks() {
        for (let index = 0; index < 1024; index += 1) {
          yield Buffer.alloc(64 * 1024);
        }
      })(),
    );

    await expect(drain(source, meter)).rejects.toBeInstanceOf(ObjectTooLargeError);
    expect(meter.bytesSeen).toBeLessThan(128 * 1024);
  });

  it('refuses to report totals before the stream finishes', () => {
    expect(() => new IntegrityMeter(10).totals()).toThrow(/before the stream finished/);
  });
});

describe('multipartEtag', () => {
  it('hashes the concatenated binary part digests and appends the part count', () => {
    const parts = [
      createHash('md5').update('part-1').digest('hex'),
      createHash('md5').update('part-2').digest('hex'),
    ];

    const expected = createHash('md5')
      .update(Buffer.concat(parts.map((hex) => Buffer.from(hex, 'hex'))))
      .digest('hex');

    expect(multipartEtag(parts)).toBe(`${expected}-2`);
  });

  it('is not the MD5 of the whole object, so ETag must not be read as a content hash', () => {
    const body = Buffer.from('abcdef');
    const wholeObjectMd5 = createHash('md5').update(body).digest('hex');
    const etag = multipartEtag([
      createHash('md5').update(body.subarray(0, 3)).digest('hex'),
      createHash('md5').update(body.subarray(3)).digest('hex'),
    ]);

    expect(etag).not.toBe(wholeObjectMd5);
    expect(etag.endsWith('-2')).toBe(true);
  });
});

describe('normalizeEtag', () => {
  it('strips quoting and weak validators so comparisons succeed', () => {
    expect(normalizeEtag('"abc"')).toBe('abc');
    expect(normalizeEtag('W/"abc"')).toBe('abc');
    expect(normalizeEtag('abc')).toBe('abc');
  });
});
