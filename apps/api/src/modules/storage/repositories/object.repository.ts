import {
  ChecksumAlgorithm,
  type Prisma,
  type PrismaClient,
  type StorageObject,
} from '@vaultstack/database';

export interface UpsertObjectRecord {
  organizationId: string;
  bucketId: string;
  storageProviderId: string;
  key: string;
  size: bigint;
  contentType: string;
  etag: string;
  checksumAlgorithm: ChecksumAlgorithm;
  checksum: string | null;
  physicalKey: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Rows scanned when collapsing keys into common prefixes. Caps the memory a
 * single delimiter listing can consume; prefixes beyond it surface on the
 * following page, since the scan advances with the same cursor.
 */
const PREFIX_SCAN_LIMIT = 10_000;

export interface ListObjectsQuery {
  organizationId: string;
  bucketId: string;
  prefix?: string;
  delimiter?: string;
  limit: number;
  cursorKey?: string;
}

export interface ListObjectsResult {
  objects: StorageObject[];
  isTruncated: boolean;
  nextCursor: string | null;
}

/**
 * Persistence for object metadata.
 *
 * Object listings are served from PostgreSQL rather than the provider, which
 * is what lets the API return stable ids and metadata without ever exposing a
 * physical storage location.
 */
export interface ObjectRepository {
  findById(organizationId: string, id: string): Promise<StorageObject | null>;
  findByKey(organizationId: string, bucketId: string, key: string): Promise<StorageObject | null>;
  list(query: ListObjectsQuery): Promise<ListObjectsResult>;
  listPrefixes(query: ListObjectsQuery): Promise<string[]>;
  create(input: UpsertObjectRecord): Promise<StorageObject>;
  replace(id: string, input: UpsertObjectRecord): Promise<StorageObject>;
  delete(organizationId: string, id: string): Promise<void>;
  updateKey(organizationId: string, id: string, key: string): Promise<StorageObject>;
}

export function createObjectRepository(prisma: PrismaClient): ObjectRepository {
  return {
    async findById(organizationId, id) {
      return prisma.storageObject.findFirst({ where: { id, organizationId } });
    },

    async findByKey(organizationId, bucketId, key) {
      return prisma.storageObject.findFirst({ where: { organizationId, bucketId, key } });
    },

    async list(query) {
      // Fetches one extra row to decide truncation without a second count.
      const rows = await prisma.storageObject.findMany({
        where: buildListWhere(query),
        orderBy: { key: 'asc' },
        take: query.limit + 1,
      });

      const isTruncated = rows.length > query.limit;
      const objects = isTruncated ? rows.slice(0, query.limit) : rows;

      return {
        objects,
        isTruncated,
        nextCursor: isTruncated ? (objects.at(-1)?.key ?? null) : null,
      };
    },

    async listPrefixes(query) {
      if (!query.delimiter) {
        return [];
      }

      // Bounded on purpose. Collapsing keys into folders needs more rows than
      // the caller's page size, but an unbounded scan would let one request on
      // a large bucket pull every key in it into API memory.
      const rows = await prisma.storageObject.findMany({
        where: buildListWhere(query),
        select: { key: true },
        orderBy: { key: 'asc' },
        take: PREFIX_SCAN_LIMIT,
      });

      const prefix = query.prefix ?? '';
      const delimiter = query.delimiter;
      const prefixes = new Set<string>();

      for (const row of rows) {
        const remainder = row.key.slice(prefix.length);
        const index = remainder.indexOf(delimiter);
        if (index !== -1) {
          prefixes.add(`${prefix}${remainder.slice(0, index + delimiter.length)}`);
        }
      }

      return [...prefixes].sort();
    },

    async create(input) {
      return prisma.storageObject.create({ data: input });
    },

    async replace(id, input) {
      return prisma.storageObject.update({
        where: { id },
        data: {
          size: input.size,
          contentType: input.contentType,
          etag: input.etag,
          checksumAlgorithm: input.checksumAlgorithm,
          checksum: input.checksum,
          physicalKey: input.physicalKey,
          metadata: input.metadata,
        },
      });
    },

    async delete(organizationId, id) {
      await prisma.storageObject.deleteMany({ where: { id, organizationId } });
    },

    async updateKey(organizationId, id, key) {
      const updated = await prisma.storageObject.updateMany({
        where: { id, organizationId },
        data: { key },
      });

      if (updated.count === 0) {
        throw new Error('Object not found while renaming');
      }

      return prisma.storageObject.findFirstOrThrow({ where: { id, organizationId } });
    },
  };
}

function buildListWhere(query: ListObjectsQuery): Prisma.StorageObjectWhereInput {
  // Prefix and cursor are combined into one filter; assigning `key` twice via
  // object spread would silently drop the first condition.
  const key: Prisma.StringFilter = {};

  if (query.prefix) {
    key.startsWith = query.prefix;
  }

  if (query.cursorKey) {
    key.gt = query.cursorKey;
  }

  return {
    organizationId: query.organizationId,
    bucketId: query.bucketId,
    ...(Object.keys(key).length > 0 ? { key } : {}),
  };
}
