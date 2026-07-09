import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { createApiError, httpStatusForCode } from '../http/api-error.ts';
import { parseCookies } from './cookie-utils.ts';

/** Emite el valor de la cookie `csrf` (legible, no httpOnly) — double-submit (D4). */
export function issueCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Compara cookie `csrf` vs header `X-CSRF-Token`; ausencia/mismatch ⇒ false (FR-013). */
export function verifyCsrf(cookieValue: string | undefined, headerValue: string | undefined): boolean {
  if (!cookieValue || !headerValue) {
    return false;
  }
  const a = Buffer.from(cookieValue, 'utf-8');
  const b = Buffer.from(headerValue, 'utf-8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Middleware: sobre mutaciones de `/api/admin/*`, cookie `csrf` vs header `X-CSRF-Token` ⇒ 403 en mismatch/ausencia (FR-013). */
export function requireCsrf(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers['cookie'] as string | undefined);
    const headerValue = req.headers['x-csrf-token'];
    if (!verifyCsrf(cookies['csrf'], typeof headerValue === 'string' ? headerValue : undefined)) {
      const apiError = createApiError('forbidden', 'CSRF inválido', req.requestId);
      res.status(httpStatusForCode('forbidden')).json(apiError);
      return;
    }
    next();
  };
}
