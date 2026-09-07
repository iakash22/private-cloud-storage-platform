import { pipeline } from 'node:stream/promises';
import { uploadContentQuerySchema } from '@vaultstack/validation';
import type { Request, Response } from 'express';
import type { AppContainer } from '../../../container/app-container.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { storageAccessDenied } from '../../../lib/errors.js';
import { routeParam } from '../../../lib/route-param.js';

export class StorageContentController {
  constructor(private readonly container: AppContainer) {}

  downloadContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const objectId = routeParam(req, 'objectId');
    const { token } = uploadContentQuerySchema.parse(req.query);
    const { storage } = this.container;

    const claims = storage.tokens.verify(token, 'download');
    if (claims.subjectId !== objectId) {
      throw storageAccessDenied('Storage token does not grant access to this object');
    }

    const controller = new AbortController();
    const onClose = (): void => {
      controller.abort();
    };
    res.on('close', onClose);

    const startedAt = Date.now();
    const { object, stream } = await storage.objects.openDownload(claims.organizationId, objectId, {
      range: parseRange(req.header('range')),
      signal: controller.signal,
    });

    res.setHeader('Content-Type', stream.contentType);
    res.setHeader('Content-Length', String(stream.size));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizeFilename(object.key.split('/').at(-1) ?? 'download')}"`,
    );
    if (stream.etag) {
      res.setHeader('ETag', `"${stream.etag}"`);
    }
    if (stream.contentRange) {
      res.status(206);
      res.setHeader('Content-Range', stream.contentRange);
      res.setHeader('Accept-Ranges', 'bytes');
    }

    try {
      await pipeline(stream.body, res);
      storage.metrics.downloadCompleted({
        organizationId: claims.organizationId,
        bucketId: object.bucketId,
        bytes: stream.size,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      res.off('close', onClose);
    }
  });

  uploadContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token } = uploadContentQuerySchema.parse(req.query);
    const controller = new AbortController();
    const onClose = (): void => {
      if (!res.writableEnded) {
        controller.abort();
      }
    };
    req.on('aborted', onClose);
    req.on('close', onClose);

    try {
      const upload = await this.container.storage.uploads.receive({
        uploadId: routeParam(req, 'uploadId'),
        token,
        body: req,
        signal: controller.signal,
      });
      res.status(200).json({ upload });
    } finally {
      req.off('aborted', onClose);
      req.off('close', onClose);
    }
  });
}

function parseRange(header: string | undefined): { start: number; end?: number } | undefined {
  if (!header) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return undefined;
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart) {
    return undefined;
  }

  return {
    start: Number(rawStart),
    ...(rawEnd ? { end: Number(rawEnd) } : {}),
  };
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
