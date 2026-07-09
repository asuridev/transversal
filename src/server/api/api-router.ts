import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';

import type { PartnerRepository } from '../persistence/partner-repository.ts';
import type { SecretResolver } from '../secrets/secret-resolver.ts';
import type { MasheryAuthConfig } from '../journey/mashery-auth.ts';
import type { ContactInfoConfig } from '../journey/contact-info-client.ts';
import type { AdminAuthGuard } from '../security/admin-auth-guard.ts';
import type { AssetStorage } from '../assets/asset-storage.ts';
import { createApiError, httpStatusForCode, type ApiError } from '../http/api-error.ts';
import { createRequestId, logRequestError } from '../observability/request-log.ts';
import { createRateLimiter } from '../security/rate-limit.ts';
import { createPublicRouter } from './public-router.ts';
import { createJourneyRouter } from './journey-router.ts';
import { createAdminRouter } from './admin-router.ts';
import { createAuthRouter, type AuthRouterDeps } from './auth-router.ts';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export interface ApiRouterDeps {
  readonly partnerRepository: PartnerRepository;
  readonly secretResolver: SecretResolver;
  readonly adminAuthGuard: AdminAuthGuard;
  readonly assetStorage: AssetStorage;
  readonly authRouterDeps: AuthRouterDeps;
  readonly webviewLoginOrigins?: readonly string[];
  /** Base URLs de Cardif para la cadena real de contact-info (parametrizadas por env). */
  readonly masheryAuthConfig: MasheryAuthConfig;
  readonly contactInfoConfig: ContactInfoConfig;
}

/** Error tipado que un handler lanza para que el manejador central lo traduzca a JSON (FR-013). */
export class HttpApiError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.apiError = apiError;
  }
}

/** Router raíz Express `/api/*`: compone sub-routers y middlewares de frontera (D1). */
export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();
  // 3mb cubre la subida de assets en base64 (validateBrandAsset permite hasta 2 MiB
  // ⇒ ~2.7 MB en base64); el límite por defecto de 100kb rechazaría imágenes reales.
  router.use(express.json({ limit: '3mb' }));

  router.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = createRequestId();
    next();
  });

  const publicRateLimiter = createRateLimiter();

  router.use(
    publicRateLimiter,
    createPublicRouter({ partnerRepository: deps.partnerRepository, webviewLoginOrigins: deps.webviewLoginOrigins }),
  );
  router.use(
    '/journey',
    createJourneyRouter({
      secretResolver: deps.secretResolver,
      masheryAuthConfig: deps.masheryAuthConfig,
      contactInfoConfig: deps.contactInfoConfig,
      sessionSeal: deps.authRouterDeps.sessionSeal,
      isActivePartner: async (slug) => {
        const partner = await deps.partnerRepository.findBySlug(slug);
        return partner !== null && partner.status === 'active';
      },
      recordCrossPartnerDenied: (event) => deps.partnerRepository.appendAccessDenied(event),
    }),
  );
  router.use(createAuthRouter(deps.authRouterDeps));
  router.use('/admin', createAdminRouter(deps));

  router.use((req: Request, res: Response) => {
    const apiError = createApiError('not_found', 'Recurso no encontrado', req.requestId);
    res.status(httpStatusForCode('not_found')).json(apiError);
  });

  router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = req.requestId ?? createRequestId();
    const apiError =
      err instanceof HttpApiError ? err.apiError : createApiError('internal', 'Error interno', requestId);
    const slugParam = req.params?.['slug'];
    logRequestError({
      requestId,
      message: 'api_error',
      code: apiError.code,
      partnerSlug: typeof slugParam === 'string' ? slugParam : undefined,
    });
    res.status(httpStatusForCode(apiError.code)).json(apiError);
  });

  return router;
}
