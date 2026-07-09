import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface CorsMiddlewareOptions {
  readonly allowedOrigins: readonly string[];
}

/**
 * CORS zero-dependencia acotado a orígenes permitidos (D6, FR-007/009) — sin
 * `*` ni `Access-Control-Allow-Credentials` (el tema es público, sin cookies).
 */
export function createCorsMiddleware(options: CorsMiddlewareOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers['origin'];
    const allowed = typeof origin === 'string' && options.allowedOrigins.includes(origin);

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      if (allowed) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'If-None-Match');
      }
      res.status(204).end();
      return;
    }

    next();
  };
}
