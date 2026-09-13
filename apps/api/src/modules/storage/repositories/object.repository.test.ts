import { describe, expect, it, vi } from 'vitest';
import { createObjectRepository } from './object.repository.js';

const ORG = 'org-1';
const BUCKET = 'bucket-1';

function repositoryOver(keys: string[]) {
  const findMany = vi.fn((args: { take?: number }) => {
    const rows = keys.map((key) => ({ key }));
    return Promise.resolve(args.take === undefined ? rows : rows.slice(0, args.take));
  });

  const prisma = { storageObject: { findMany } };

  return { repository: createObjectRepository(prisma as never), findMany };
}

describe('object repository listings', () => {
  it('bounds the prefix scan instead of reading every key in the bucket', async () => {
    const { repository, findMany } = repositoryOver([]);

    await repository.listPrefixes({
      organizationId: ORG,
      bucketId: BUCKET,
      delimiter: '/',
      limit: 10,
    });

    const take = findMany.mock.calls[0]?.[0]?.take;
    expect(take).toBeTypeOf('number');
    expect(take).toBeLessThanOrEqual(10_000);
  });

  it('scopes the prefix scan to one organization and bucket', async () => {
    const { repository, findMany } = repositoryOver([]);

    await repository.listPrefixes({
      organizationId: ORG,
      bucketId: BUCKET,
      delimiter: '/',
      limit: 10,
    });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { organizationId: ORG, bucketId: BUCKET, isDeleted: false },
    });
  });

  it('still collapses keys into the folders they share', async () => {
    const { repository } = repositoryOver([
      'docs/2024/a.pdf',
      'docs/2024/b.pdf',
      'docs/2025/c.pdf',
      'top-level.txt',
    ]);

    const prefixes = await repository.listPrefixes({
      organizationId: ORG,
      bucketId: BUCKET,
      prefix: 'docs/',
      delimiter: '/',
      limit: 10,
    });

    expect(prefixes).toEqual(['docs/2024/', 'docs/2025/']);
  });

  it('keeps an explicitly created empty folder visible', async () => {
    const { repository } = repositoryOver(['docs/empty/']);

    const prefixes = await repository.listPrefixes({
      organizationId: ORG,
      bucketId: BUCKET,
      prefix: 'docs/',
      delimiter: '/',
      limit: 10,
      includeFolderMarkers: true,
    });

    expect(prefixes).toEqual(['docs/empty/']);
  });

  it('returns nothing when no delimiter is supplied', async () => {
    const { repository, findMany } = repositoryOver(['docs/a.pdf']);

    const prefixes = await repository.listPrefixes({
      organizationId: ORG,
      bucketId: BUCKET,
      limit: 10,
    });

    expect(prefixes).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('excludes folder marker keys from dashboard object listings', async () => {
    const { repository, findMany } = repositoryOver([]);

    await repository.list({
      organizationId: ORG,
      bucketId: BUCKET,
      limit: 10,
    });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        NOT: { key: { endsWith: '/' } },
      },
    });
  });

  it('adds a case-insensitive key search to listings', async () => {
    const { repository, findMany } = repositoryOver([]);

    await repository.list({
      organizationId: ORG,
      bucketId: BUCKET,
      search: 'report',
      limit: 10,
    });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        key: {
          contains: 'report',
          mode: 'insensitive',
        },
      },
    });
  });
});
