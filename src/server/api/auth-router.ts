import { Router, type Request, type Response } from 'express';

import type { SessionSeal } from '../security/session-seal.ts';
import { sealJson, unsealJson } from '../security/session-seal.ts';
import type { RoleMapConfig } from '../security/role-map.ts';
import { deriveRoles } from '../security/role-map.ts';
import type { PartnerClaimConfig } from '../security/partner-claim.ts';
import { derivePartnerRef } from '../security/partner-claim.ts';
import { issueCsrfToken, verifyCsrf } from '../security/csrf.ts';
import { parseCookies, serializeCookie, expireCookie } from '../security/cookie-utils.ts';
import { createApiError, httpStatusForCode } from '../http/api-error.ts';
import type { PartnerRepository } from '../persistence/partner-repository.ts';
import { moduleExists, resolveModuleRoute } from '../security/module-catalog.ts';

export interface AuthorizationRequest {
  readonly url: URL;
  readonly codeVerifier: string;
  readonly state: string;
  readonly nonce: string;
}

export interface AuthRouterDeps {
  readonly buildAuthorizationRequest: (redirectUri: string) => Promise<AuthorizationRequest>;
  readonly exchangeAuthorizationCode: (
    currentUrl: URL,
    checks: { pkceCodeVerifier: string; expectedState: string; expectedNonce: string },
  ) => Promise<Record<string, unknown>>;
  readonly sessionSeal: SessionSeal;
  readonly txSealKey: string;
  readonly roleMapConfig: RoleMapConfig;
  readonly partnerClaimConfig: PartnerClaimConfig;
  readonly partnerRepository: Pick<PartnerRepository, 'findBySlug'>;
  readonly sessionTtlSeconds: number;
  readonly redirectUri: string;
  readonly postLogoutRedirectUri?: string;
  readonly endSession?: (params: { postLogoutRedirectUri: string }) => Promise<URL>;
  readonly secureCookies: boolean;
  readonly now?: () => number;
}

interface TxPayload {
  readonly codeVerifier: string;
  readonly state: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly moduleId?: string;
}

const DEFAULT_RETURN_TO = '/admin';
const TX_COOKIE_TTL_SECONDS = 600;

function safeReturnTo(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : DEFAULT_RETURN_TO;
}

function currentUrlOf(req: Request): URL {
  return new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
}

/** `/api/auth/*` + `/api/admin/session` — mediación OIDC (Code+PKCE) y ciclo de sesión (auth-api.contract). */
export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const now = deps.now ?? (() => Date.now());

  router.get('/auth/login', async (req: Request, res: Response) => {
    const rawModule = req.query['module'];
    const moduleId = typeof rawModule === 'string' && moduleExists(rawModule) ? rawModule : undefined;
    const returnTo = safeReturnTo(req.query['returnTo']);
    const { url, codeVerifier, state, nonce } = await deps.buildAuthorizationRequest(deps.redirectUri);
    const tx: TxPayload = { codeVerifier, state, nonce, returnTo, ...(moduleId !== undefined ? { moduleId } : {}) };

    res.setHeader('Set-Cookie', [
      serializeCookie('bo_oidc_tx', sealJson(tx, deps.txSealKey), {
        httpOnly: true,
        secure: deps.secureCookies,
        sameSite: 'Lax',
        maxAgeSeconds: TX_COOKIE_TTL_SECONDS,
      }),
    ]);
    res.redirect(302, url.toString());
  });

  router.get('/auth/callback', async (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers['cookie'] as string | undefined);
    const rawTx = cookies['bo_oidc_tx'];
    const tx = rawTx ? unsealJson<TxPayload>(rawTx, deps.txSealKey) : null;
    const clearTx = expireCookie('bo_oidc_tx', { secure: deps.secureCookies, sameSite: 'Lax' });

    if (!tx) {
      res.setHeader('Set-Cookie', [clearTx]);
      res.redirect(302, '/forbidden');
      return;
    }

    try {
      const claims = await deps.exchangeAuthorizationCode(currentUrlOf(req), {
        pkceCodeVerifier: tx.codeVerifier,
        expectedState: tx.state,
        expectedNonce: tx.nonce,
      });

      const sub = String(claims['sub'] ?? '');
      const name = String(claims['name'] ?? claims['preferred_username'] ?? sub);
      const roles = deriveRoles(claims, deps.roleMapConfig);

      // Derivar y validar la pertenencia asesor→partner (007, D1/D2, FR-001/008).
      // Ausente ⇒ sesión sin partner (comportamiento admin, 006, sin cambios).
      const partnerRef = derivePartnerRef(claims, deps.partnerClaimConfig);
      let partnerId: string | undefined;
      let partnerSlug: string | undefined;
      let partnerKey: string | undefined;
      if (partnerRef !== null) {
        const partner = await deps.partnerRepository.findBySlug(partnerRef);
        if (!partner || partner.status !== 'active') {
          // FR-008: partner inexistente/inactivo ⇒ falla segura, sin sesión.
          res.setHeader('Set-Cookie', [clearTx]);
          res.redirect(302, '/forbidden');
          return;
        }
        partnerId = partner.id;
        partnerSlug = partner.slug;
        partnerKey = partner.partnerKey;
      }

      const iat = Math.floor(now() / 1000);
      const sealedSession = deps.sessionSeal.seal({
        sub,
        name,
        roles,
        ...(partnerId !== undefined ? { partnerId } : {}),
        ...(partnerSlug !== undefined ? { partnerSlug } : {}),
        ...(partnerKey !== undefined ? { partnerKey } : {}),
        iat,
        exp: iat + deps.sessionTtlSeconds,
      });
      const csrfToken = issueCsrfToken();

      res.setHeader('Set-Cookie', [
        serializeCookie('bo_session', sealedSession, {
          httpOnly: true,
          secure: deps.secureCookies,
          sameSite: 'Strict',
          maxAgeSeconds: deps.sessionTtlSeconds,
        }),
        serializeCookie('csrf', csrfToken, {
          httpOnly: false,
          secure: deps.secureCookies,
          sameSite: 'Strict',
          maxAgeSeconds: deps.sessionTtlSeconds,
        }),
        clearTx,
      ]);

      const route =
        tx.moduleId !== undefined
          ? (resolveModuleRoute(tx.moduleId, { roles, hasPartner: partnerSlug !== undefined }) ?? DEFAULT_RETURN_TO)
          : tx.returnTo;
      res.redirect(302, route);
    } catch {
      // Falla segura (FR-003, edge "claim manipulado"/"IdP no disponible"): sin sesión emitida.
      res.setHeader('Set-Cookie', [clearTx]);
      res.redirect(302, '/forbidden');
    }
  });

  router.get('/admin/session', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers['cookie'] as string | undefined);
    const raw = cookies['bo_session'];
    const session = raw ? deps.sessionSeal.unseal(raw) : null;

    if (!session) {
      const apiError = createApiError('unauthorized', 'No autorizado', req.requestId);
      res.status(httpStatusForCode('unauthorized')).json(apiError);
      return;
    }

    // Solo se expone `partnerSlug` al cliente (lo consume el guard de
    // aislamiento e `isAsesor`). `partnerId` y `partnerKey` permanecen
    // exclusivamente server-side (sellados en `bo_session`): el `partnerKey` es
    // un secreto y el `partnerId` no tiene consumidor en el cliente — ambos son
    // resolubles del lado del servidor a partir del `partnerSlug`/la sesión.
    res.status(200).json({
      subject: session.sub,
      name: session.name,
      roles: session.roles,
      ...(session.partnerSlug !== undefined ? { partnerSlug: session.partnerSlug } : {}),
    });
  });

  router.post('/auth/logout', async (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers['cookie'] as string | undefined);
    const csrfHeader = req.headers['x-csrf-token'];
    if (!verifyCsrf(cookies['csrf'], typeof csrfHeader === 'string' ? csrfHeader : undefined)) {
      const apiError = createApiError('forbidden', 'CSRF inválido', req.requestId);
      res.status(httpStatusForCode('forbidden')).json(apiError);
      return;
    }

    res.setHeader('Set-Cookie', [
      expireCookie('bo_session', { secure: deps.secureCookies, sameSite: 'Strict' }),
      expireCookie('csrf', { secure: deps.secureCookies, sameSite: 'Strict' }),
    ]);

    // RP-initiated logout (D4, FR-014): termina también la sesión del realm,
    // sin la cual re-entrar reestablecería sesión sin credenciales (CT-12).
    // Fail-safe: si el end-session no está disponible, las cookies locales
    // ya quedaron expiradas arriba (no se deja sesión operativa viva).
    if (deps.endSession && deps.postLogoutRedirectUri) {
      try {
        const endSessionUrl = await deps.endSession({ postLogoutRedirectUri: deps.postLogoutRedirectUri });
        res.status(200).json({ ok: true, endSessionUrl: endSessionUrl.toString() });
        return;
      } catch {
        // sin end-session disponible: cookies locales ya expiradas, se responde igual.
      }
    }
    res.status(200).json({ ok: true });
  });

  return router;
}
