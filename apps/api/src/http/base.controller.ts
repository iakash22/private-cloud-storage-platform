import type { Request, Response } from 'express';
import type { AppContainer } from '../container/app-container.js';
import { requireAuth } from '../middleware/authenticate.js';
import type { AuthContext } from '../modules/auth/auth.types.js';

export abstract class BaseController {
  constructor(protected readonly container: AppContainer) {}

  protected ok(res: Response, body: unknown): void {
    res.status(200).json(body);
  }

  protected created(res: Response, body: unknown): void {
    res.status(201).json(body);
  }

  protected noContent(res: Response): void {
    res.status(204).send();
  }
}

export abstract class AuthenticatedController extends BaseController {
  protected requireAuth(req: Request): AuthContext {
    return requireAuth(req);
  }
}
