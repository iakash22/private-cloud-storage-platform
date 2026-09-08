import type {
  BackupTargetAdapter,
  BackupTargetContext,
  BackupTargetResult,
} from './target.types.js';
import { componentPath, writeTextFile } from '../domain/redact.js';

export function createVaultstackObjectMetadataTarget(): BackupTargetAdapter {
  return {
    target: 'VAULTSTACK_OBJECT_METADATA',
    scope: 'organization',
    async collect(ctx: BackupTargetContext): Promise<BackupTargetResult> {
      const rows: string[] = [];
      let cursor: string | undefined;
      const pageSize = 500;

      for (;;) {
        const page = await ctx.prisma.storageObject.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { id: 'asc' },
          take: pageSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          select: {
            id: true,
            bucketId: true,
            key: true,
            size: true,
            contentType: true,
            etag: true,
            checksum: true,
            isDeleted: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        if (page.length === 0) {
          break;
        }
        for (const object of page) {
          rows.push(
            JSON.stringify({
              ...object,
              size: object.size.toString(),
            }),
          );
        }
        cursor = page[page.length - 1]?.id;
        if (page.length < pageSize) {
          break;
        }
      }

      const dest = componentPath(ctx.workDir, 'object-metadata.jsonl');
      await writeTextFile(dest, rows.length > 0 ? `${rows.join('\n')}\n` : '');
      return {
        target: 'VAULTSTACK_OBJECT_METADATA',
        status: 'collected',
        relativeFiles: ['components/object-metadata.jsonl'],
      };
    },
  };
}
