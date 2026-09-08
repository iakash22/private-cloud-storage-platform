import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width, '0');
}

function writeChecksum(header: Buffer): void {
  header.write('        ', 148, 8);
  let sum = 0;
  for (const byte of header) {
    sum += byte;
  }
  header.write(`${octal(sum, 6)}\0 `, 148, 8, 'utf8');
}

function fileHeader(name: string, size: number, mode = 0o644): Buffer {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0, 100, 'utf8');
  header.write(`${octal(mode, 7)}\0`, 100, 8, 'utf8');
  header.write(`${octal(0, 7)}\0`, 108, 8, 'utf8');
  header.write(`${octal(0, 7)}\0`, 116, 8, 'utf8');
  header.write(`${octal(size, 11)}\0`, 124, 12, 'utf8');
  header.write(`${octal(Math.floor(Date.now() / 1000), 11)}\0`, 136, 12, 'utf8');
  header.write('0', 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  header.write('00', 263, 2, 'utf8');
  writeChecksum(header);
  return header;
}

export async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files.sort();
}

export async function createGzipTarFromDirectory(
  sourceDir: string,
  destFile: string,
): Promise<{ size: number; sha256: string }> {
  const files = await walkFiles(sourceDir);
  const gzip = createGzip();
  const output = createWriteStream(destFile);
  const done = pipeline(gzip, output);

  for (const file of files) {
    const rel = relative(sourceDir, file).split(sep).join('/');
    const info = await stat(file);
    gzip.write(fileHeader(rel, info.size));
    gzip.write(await readFile(file));
    const pad = (512 - (info.size % 512)) % 512;
    if (pad > 0) {
      gzip.write(Buffer.alloc(pad));
    }
  }

  gzip.write(Buffer.alloc(1024));
  gzip.end();
  await done;

  const body = await readFile(destFile);
  return {
    size: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

function readOctal(buf: Buffer, start: number, length: number): number {
  const raw = buf
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0/g, '')
    .trim();
  if (!raw) {
    return 0;
  }
  return Number.parseInt(raw, 8);
}

export async function extractGzipTar(archivePath: string, destDir: string): Promise<string[]> {
  await mkdir(destDir, { recursive: true });
  const tarPath = join(destDir, '.archive.tar');
  await pipeline(createReadStream(archivePath), createGunzip(), createWriteStream(tarPath));
  const tar = await readFile(tarPath);
  const written: string[] = [];
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = header.subarray(0, 100).toString('utf8').replace(/\0/g, '').trim();
    const size = readOctal(header, 124, 12);
    offset += 512;
    const content = tar.subarray(offset, offset + size);
    offset += size + ((512 - (size % 512)) % 512);

    if (!name || name.startsWith('.') || name.includes('..')) {
      continue;
    }

    const dest = join(destDir, name);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content);
    written.push(name);
  }

  return written;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
