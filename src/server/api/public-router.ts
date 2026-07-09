import { Router, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';

import type { PartnerRepository } from '../persistence/partner-repository.ts';
import { toPublicTheme } from '../../shared/partner/theme-projection.ts';
import { getDefaultPublicTheme } from '../theme/default-theme.ts';
import { createApiError, httpStatusForCode } from '../http/api-error.ts';
import { validateSlugParam } from '../http/validation.ts';
import { createCorsMiddleware } from '../security/cors.ts';

export interface PublicRouterDeps {
  readonly partnerRepository: PartnerRepository;
  /** Orígenes permitidos (webview-login) para CORS de tema/partners activos (D6). */
  readonly webviewLoginOrigins?: readonly string[];
}

const THEME_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const ACTIVE_PARTNERS_CACHE_CONTROL = 'public, max-age=30';

function etagFor(slug: string, version: number): string {
  return `"${createHash('sha1').update(`${slug}:${version}`).digest('hex')}"`;
}

/** `GET /theme/:slug`, `GET /partners/active` — proyección pública cacheada (FR-007..010). */
export function createPublicRouter(deps: PublicRouterDeps): Router {
  const router = Router();
  const cors = createCorsMiddleware({ allowedOrigins: deps.webviewLoginOrigins ?? [] });

  router.options('/theme/:slug', cors);
  router.options('/partners/active', cors);

  router.get('/theme/:slug', cors, async (req: Request, res: Response) => {
    const slugResult = validateSlugParam(String(req.params['slug'] ?? ''));
    if (!slugResult.ok) {
      const apiError = createApiError('invalid_input', 'Slug inválido', req.requestId, { field: 'slug' });
      res.status(httpStatusForCode('invalid_input')).json(apiError);
      return;
    }

    const publishedTheme = await deps.partnerRepository.getPublishedTheme(slugResult.slug);
    const partner = publishedTheme ? await deps.partnerRepository.findBySlug(slugResult.slug) : null;

    const publicTheme =
      publishedTheme && partner ? toPublicTheme(publishedTheme, partner) : getDefaultPublicTheme();

    const etag = etagFor(publicTheme.slug, publicTheme.version);
    res.set('Cache-Control', THEME_CACHE_CONTROL);
    res.set('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.status(200).json(publicTheme);
  });

  router.get('/partners/active', cors, async (_req: Request, res: Response) => {
    const slugs = await deps.partnerRepository.findActiveSlugs();
    res.set('Cache-Control', ACTIVE_PARTNERS_CACHE_CONTROL);
    res.status(200).json({ slugs });
  });

  return router;
}
