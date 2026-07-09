import type { Request, Response, NextFunction, RequestHandler } from 'express';

import type { SessionSeal } from './session-seal.ts';
import { parseCookies } from './cookie-utils.ts';
import { createApiError, httpStatusForCode } from '../http/api-error.ts';
import { validateSlugParam } from '../http/validation.ts';
import { logRequestError } from '../observability/request-log.ts';

/** Partner del asesor resuelto de la sesión — autoritativo (007, D4, FR-005). */
export interface RequestPartnerScope {
  readonly id: string;
  readonly slug: string;
  readonly actorSub: string;
  readonly actorName: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    partner?: RequestPartnerScope;
  }
}

export interface PartnerScopeDeps {
  readonly sessionSeal: Pick<SessionSeal, 'unseal'>;
  /** Consulta el catálogo de partners (`PartnerRepository`) para el slug de la sesión. */
  readonly isActivePartner: (slug: string) => Promise<boolean>;
  /** Append-only en `audit_log` del intento de acceso cruzado (D5, FR-011). */
  readonly recordCrossPartnerDenied: (event: {
    actorSub: string;
    actorName: string;
    attemptedSlug: string;
  }) => Promise<void>;
}

/**
 * Frontera server-side del aislamiento por partner (007, D3). Antepuesto a
 * `POST /journey/:slug/*` (y reutilizable en cualquier futura ruta partner-
 * scoped, US3): exige sesión válida, exige partner en la sesión, rechaza como
 * `not_found` cualquier cruce (sin enumeración, FR-007) y re-verifica que el
 * partner de la sesión siga activo (FR-003). Adjunta `req.partner` — cualquier
 * handler debe usar `req.partner.slug`/`req.partner.id` como autoritativo (D4),
 * nunca el `:slug` u otro identificador de partner del cliente (query, body,
 * cabecera).
 *
 * Si la ruta no declara `:slug` (p. ej. una ruta de lectura colectiva del
 * asesor sin partner en la URL, US3), el paso de comparación se omite: el
 * alcance se deriva íntegramente de la sesión.
 */
export function requirePartnerScope(deps: PartnerScopeDeps): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const cookies = parseCookies(req.headers['cookie'] as string | undefined);
    const raw = cookies['bo_session'];
    const session = raw ? deps.sessionSeal.unseal(raw) : null;

    if (!session) {
      const apiError = createApiError('unauthorized', 'No autorizado', req.requestId);
      res.status(httpStatusForCode('unauthorized')).json(apiError);
      return;
    }

    if (!session.partnerSlug || !session.partnerId) {
      // Sesión sin partner (admin de Back Office u otra identidad sin vínculo
      // válido, FR-008): no puede operar el journey del asesor. `not_found`
      // para no revelar nada sobre el slug solicitado.
      const apiError = createApiError('not_found', 'Recurso no encontrado', req.requestId);
      res.status(httpStatusForCode('not_found')).json(apiError);
      return;
    }

    const rawSlug = req.params['slug'];
    if (rawSlug !== undefined) {
      const slugResult = validateSlugParam(String(rawSlug));
      if (!slugResult.ok) {
        const apiError = createApiError('invalid_input', 'Slug inválido', req.requestId, { field: 'slug' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      if (slugResult.slug !== session.partnerSlug) {
        // Cruce entre partners (FR-004/005/007, SC-002/005): indistinguible de
        // "no encontrado" — no confirma la existencia del partner ajeno.
        await deps.recordCrossPartnerDenied({
          actorSub: session.sub,
          actorName: session.name,
          attemptedSlug: slugResult.slug,
        });
        // Observabilidad operativa además de la auditoría inmutable (T031) —
        // ningún dato del partner ajeno más allá del slug solicitado (FR-021).
        logRequestError({
          requestId: req.requestId,
          message: 'cross_partner_denied',
          partnerSlug: session.partnerSlug,
          attemptedSlug: slugResult.slug,
        });
        const apiError = createApiError('not_found', 'Recurso no encontrado', req.requestId);
        res.status(httpStatusForCode('not_found')).json(apiError);
        return;
      }
    }

    const active = await deps.isActivePartner(session.partnerSlug);
    if (!active) {
      // FR-003, edge "partner desactivado": el partner de la sesión ya no es
      // válido; se re-verifica en cada request, no se confía en la sesión sola.
      const apiError = createApiError('not_found', 'Recurso no encontrado', req.requestId);
      res.status(httpStatusForCode('not_found')).json(apiError);
      return;
    }

    req.partner = {
      id: session.partnerId,
      slug: session.partnerSlug,
      actorSub: session.sub,
      actorName: session.name,
    };
    next();
  };
}

/**
 * Filtro obligatorio derivado de la sesión para lecturas colectivas del
 * asesor (007, US3, FR-006). Cualquier filtro de partner que el cliente
 * intente enviar (query/body) se **ignora**: el alcance de la consulta es
 * siempre este, nunca el del cliente. Requiere que `requirePartnerScope` haya
 * corrido antes (`req.partner` garantizado).
 */
export function partnerScopeFilter(req: Request): { partnerId: string } {
  return { partnerId: req.partner!.id };
}
