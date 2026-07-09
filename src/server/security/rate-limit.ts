import type { NextFunction, Request, Response } from 'express';

import { createApiError, httpStatusForCode } from '../http/api-error.ts';

export interface RateLimiterOptions {
  readonly windowMs?: number;
  readonly max?: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limiter in-memory por IP+ruta (single-node, D9): ventana fija. Mitiga la
 * enumeración de slugs en los endpoints públicos (FR-020).
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const max = options.max ?? DEFAULT_MAX;
  const buckets = new Map<string, Bucket>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const apiError = createApiError('rate_limited', 'Demasiadas solicitudes', req.requestId ?? 'unknown');
      res.status(httpStatusForCode('rate_limited')).json(apiError);
      return;
    }

    next();
  };
}
