import {
  folderAccessRuleBodySchema,
  folderAccessRuleParamsSchema,
  listFolderAccessQuerySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { StorageScopedController } from '../../../http/storage-scoped.controller.js';
import { readBody } from '../../../middleware/validate.js';

export class FolderAccessController extends StorageScopedController {
  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const bucketId = routeParam(req, 'bucketId');
    const { prefix } = listFolderAccessQuerySchema.parse(req.query);
    const rules = await this.container.folderAccess.list(
      this.organizationId(req),
      bucketId,
      prefix,
    );
    this.ok(res, { rules });
  });

  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, folderAccessRuleBodySchema);
    const rule = await this.container.folderAccess.create({
      ...body,
      actorUserId: auth.user.id,
      organizationId: this.organizationId(req),
      meta: requestMeta(req),
    });
    this.created(res, { rule });
  });

  remove: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    // Parse here as this route has no shared bucket scope.
    const params = folderAccessRuleParamsSchema.parse(req.params);
    await this.container.folderAccess.remove(
      this.organizationId(req),
      params.ruleId,
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });
}
