import { pipeline } from 'node:stream/promises';
import {
  objectIdParamsSchema,
  uploadContentQuerySchema,
  uploadIdParamsSchema,
} from '@vaultstack/validation';
import { Router } from 'express';
import { asyncHandler } from '../../../lib/async-handler.js';
import { storageAccessDenied } from '../../../lib/errors.js';
import { routeParam } from '../../../lib/route-param.js';
import { validateParams, validateQuery } from '../../../middleware/validate.js';
import type { ObjectService } from '../services/object.service.js';
import type { StorageTokenService } from '../services/storage-token.service.js';
import type { StorageMetrics } from '../services/storage.metrics.js';
import type { UploadService } from '../services/upload.service.js';

/**
 * Byte-transfer routes authorized by a scoped, short-lived HMAC token instead
 * of a browser session.
 *
 * These are mounted outside the authenticated router on purpose: a presigned
 * URL must work the same way an S3 presigned URL does, without VaultStack
 * cookies. The token is object- or upload-scoped, expires, and carries the
 * organization, so it grants nothing beyond that single resource. No storage
 * credential is ever exposed.
 */
export function createStorageContentRouter(deps: {
  objects: ObjectService;
  uploads: UploadService;
  tokens: StorageTokenService;
  metrics: StorageMetrics;
}): Router {
  const router = Router();

  router.get(
    '/objects/:objectId/content',
    validateParams(objectIdParamsSchema),
    validateQuery(uploadContentQuerySchema),
    asyncHandler(async (req, res) => {
      const objectId = routeParam(req, 'objectId');
      const { token } = uploadContentQuerySchema.parse(req.query);

      const claims = deps.tokens.verify(token, 'download');
      if (claims.subjectId !== objectId) {
        // A token issued for one object cannot be replayed against another.
        throw storageAccessDenied('Storage token does not grant access to this object');
      }

      const controller = new AbortController();
      const onClose = (): void => {
        controller.abort();
      };
      res.on('close', onClose);

      const startedAt = Date.now();
      const { object, stream } = await deps.objects.openDownload(claims.organizationId, objectId, {
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
        // Streams to the client with backpressure; the object is never buffered.
        await pipeline(stream.body, res);

        deps.metrics.downloadCompleted({
          organizationId: claims.organizationId,
          bucketId: object.bucketId,
          bytes: stream.size,
          durationMs: Date.now() - startedAt,
        });
      } finally {
        res.off('close', onClose);
      }
    }),
  );

  router.put(
    '/uploads/:uploadId/content',
    validateParams(uploadIdParamsSchema),
    validateQuery(uploadContentQuerySchema),
    asyncHandler(async (req, res) => {
      const { token } = uploadContentQuerySchema.parse(req.query);
      const controller = new AbortController();

      // Aborts the provider write when the client disconnects mid-upload, so
      // partial data is cleaned up rather than left staged.
      const onClose = (): void => {
        if (!res.writableEnded) {
          controller.abort();
        }
      };
      req.on('aborted', onClose);
      req.on('close', onClose);

      try {
        const upload = await deps.uploads.receive({
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
    }),
  );

  return router;
}

/** Parses a single-range `Range: bytes=start-end` header; ignores anything else. */
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
