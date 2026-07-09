import { Router, type Request, type Response, type NextFunction } from 'express';

import type { SecretResolver } from '../secrets/secret-resolver.ts';
import { createMasheryClient } from '../journey/mashery-client.ts';
import { orchestrateJourney } from '../journey/orchestrate-journey.ts';
import { acquireApiTokens, type MasheryAuthConfig } from '../journey/mashery-auth.ts';
import { fetchContactInfo, type ContactInfoConfig } from '../journey/contact-info-client.ts';
import { createApiError, httpStatusForCode } from '../http/api-error.ts';
import { isPlainObjectBody } from '../http/validation.ts';
import { logRequestError } from '../observability/request-log.ts';
import { requirePartnerScope, type PartnerScopeDeps } from '../security/require-partner-scope.ts';

export interface JourneyRouterDeps extends PartnerScopeDeps {
  readonly secretResolver: SecretResolver;
  /** Base URLs de los servicios de Cardif para la cadena real de contact-info. */
  readonly masheryAuthConfig: MasheryAuthConfig;
  readonly contactInfoConfig: ContactInfoConfig;
}

/** `name_api` cuyo access_token autoriza la consulta de contact-info (paso 3 → paso 1). */
const CONTACT_INFO_TOKEN_NAME = 'AuthorizationCustomer';

/**
 * `POST /journey/:slug/*` — orquesta una acción del journey contra Mashery
 * (FR-011..014). Antepone `requirePartnerScope` (007, D3): sesión de asesor
 * obligatoria, cruce entre partners ⇒ `not_found`, partner de la **sesión**
 * autoritativo (D4) — el `:slug` del cliente solo sirvió para detectar el
 * cruce, nunca amplía el alcance de la orquestación.
 */
export function createJourneyRouter(deps: JourneyRouterDeps): Router {
  const router = Router();
  const masheryClient = createMasheryClient();

  /**
   * `POST /journey/:slug/contact-info` — consulta de información de contacto del
   * cliente por documento (KYC). Misma frontera partner-scoped que el proxy
   * genérico; el partner de la **sesión** (`req.partner`) es autoritativo para
   * el aislamiento. Orquesta la cadena real de Cardif: pasos 2 y 3
   * (`acquireApiTokens`) para obtener `paramj` + el token `AuthorizationCustomer`,
   * y paso 1 (`fetchContactInfo`) para la consulta. El `partnerKey` (`_p`) se
   * deriva de la sesión sellada (`req.partner`, nunca del cliente); el
   * `correlation-id` llega como header del cliente. Ambos se reenvían a Cardif.
   */
  router.post('/:slug/contact-info', requirePartnerScope(deps), async (req: Request, res: Response) => {
    try {
      if (!isPlainObjectBody(req.body)) {
        const apiError = createApiError('invalid_input', 'Body inválido', req.requestId, { field: 'body' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      const { documentType, documentNumber } = req.body;
      if (typeof documentType !== 'string' || documentType.length === 0) {
        const apiError = createApiError('invalid_input', 'documentType requerido', req.requestId, { field: 'documentType' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }
      if (typeof documentNumber !== 'string' || documentNumber.length === 0) {
        const apiError = createApiError('invalid_input', 'documentNumber requerido', req.requestId, { field: 'documentNumber' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      // `partnerKey` autoritativo de la sesión (007, D4) — nunca del cliente.
      // `requirePartnerScope` ya garantizó su presencia.
      const partnerKey = req.partner!.partnerKey;

      const correlationHeader = req.headers['x-correlation-id'];
      const correlationId = String(
        (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) ?? req.requestId,
      );

      const tokens = await acquireApiTokens(deps.masheryAuthConfig, { partnerKey, correlationId });
      const accessToken = tokens.tokenFor(CONTACT_INFO_TOKEN_NAME);
      if (!accessToken) {
        logRequestError({
          requestId: req.requestId,
          message: 'contact_info_no_token',
          partnerSlug: req.partner!.slug,
        });
        const apiError = createApiError('mashery_error', 'No se obtuvo autorización para la consulta', req.requestId);
        res.status(httpStatusForCode('mashery_error')).json(apiError);
        return;
      }

      const body = await fetchContactInfo(deps.contactInfoConfig, {
        partnerKey,
        correlationId,
        paramj: tokens.paramj,
        accessToken,
        documentType,
        documentNumber,
      });

      res.status(200).json(body);
    } catch (err) {
      logRequestError({
        requestId: req.requestId,
        message: 'contact_info_upstream_error',
        partnerSlug: req.partner?.slug,
      });
      const apiError = createApiError('mashery_unavailable', 'El proveedor de contact-info no respondió', req.requestId);
      res.status(httpStatusForCode('mashery_unavailable')).json(apiError);
    }
  });

  router.post('/:slug/{*action}', requirePartnerScope(deps), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isPlainObjectBody(req.body)) {
        const apiError = createApiError('invalid_input', 'Body inválido', req.requestId, { field: 'body' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      const actionParam = req.params['action'];
      const action = Array.isArray(actionParam) ? actionParam.join('/') : (actionParam ?? '');

      // D4/FR-005: el partner de la sesión (`req.partner`) es autoritativo —
      // nunca el `:slug` de la URL ni ningún partner del cuerpo de la petición.
      const authoritativeSlug = req.partner!.slug;

      const result = await orchestrateJourney(
        { slug: authoritativeSlug, action, payload: req.body },
        { secretResolver: deps.secretResolver, masheryClient, requestId: req.requestId },
      );

      if (result.kind === 'error') {
        logRequestError({
          requestId: req.requestId,
          message: 'journey_error',
          partnerSlug: authoritativeSlug,
          code: result.error.code,
        });
        res.status(httpStatusForCode(result.error.code)).json(result.error);
        return;
      }

      res.status(200).json(result.body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
