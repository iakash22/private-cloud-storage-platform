import type { Request } from 'express';
import { validationError } from './errors.js';

export function routeParam(req: Request, name: string): string {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw validationError(`Missing route parameter ${name}`);
  }
  return value;
}
