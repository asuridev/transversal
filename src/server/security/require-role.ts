import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { AppRole } from './role-map.ts';
import { createApiError, httpStatusForCode } from '../http/api-error.ts';

/** `requireRole(...roles)`: 403 si la sesión no incluye ninguno de los roles pedidos (FR-006/007, D7). */
export function requireRole(...roles: AppRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const sessionRoles = req.adminSession?.roles ?? [];
    const allowed = roles.some((role) => sessionRoles.includes(role));
    if (!allowed) {
      const apiError = createApiError('forbidden', 'Rol insuficiente', req.requestId);
      res.status(httpStatusForCode('forbidden')).json(apiError);
      return;
    }
    next();
  };
}
