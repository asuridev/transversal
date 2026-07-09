import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

import { createApiRouter } from './server/api/api-router.ts';
import type { AuthRouterDeps } from './server/api/auth-router.ts';
import { createPartnerRepository } from './server/persistence/persistence-config.ts';
import { createSecretResolver } from './server/secrets/env-secret-resolver.ts';
import { resolveOidcSecrets, type OidcSecrets } from './server/secrets/oidc-secrets.ts';
import { createSessionAdminAuthGuard } from './server/security/admin-auth-guard.ts';
import { createSessionSeal, type SessionSeal } from './server/security/session-seal.ts';
import { loadRoleMapConfigFromEnv } from './server/security/role-map.ts';
import { loadPartnerClaimConfigFromEnv } from './server/security/partner-claim.ts';
import { getOidcConfiguration, loadOidcEnvConfig, type OidcEnvConfig } from './server/oidc/oidc-config.ts';
import { buildAuthorizationUrl, authorizationCodeGrant, buildEndSessionUrl } from './server/oidc/oidc-flow.ts';
import { createAssetStorage } from './server/assets/asset-storage.ts';
import { createAssetsRouter } from './server/assets/assets-router.ts';

function memoize<T>(fn: () => T): () => T {
  let cached: T | undefined;
  let computed = false;
  return () => {
    if (!computed) {
      cached = fn();
      computed = true;
    }
    return cached as T;
  };
}

/**
 * Compone las dependencias de OIDC/sesión del BFF (D1/D2/D5/D6/D12) —
 * composition root. Resuelve secretos/env de forma **perezosa** (solo al
 * primer request que los necesita): construir este objeto no debe fallar si
 * el proceso aún no tiene `OIDC_CLIENT_SECRET`/`SESSION_SEAL_KEY` (p. ej.
 * herramientas de build que importan este módulo sin arrancar el servidor).
 */
function createAuthRouterDeps(partnerRepository: AuthRouterDeps['partnerRepository']): AuthRouterDeps {
  const getSecrets = memoize<OidcSecrets>(resolveOidcSecrets);
  const getEnvConfig = memoize<OidcEnvConfig>(() => loadOidcEnvConfig(process.env, getSecrets().clientSecret));
  const getSessionSeal = memoize<SessionSeal>(() => createSessionSeal({ key: getSecrets().sessionSealKey }));
  const secureCookies = process.env['NODE_ENV'] === 'production';

  return {
    buildAuthorizationRequest: async (redirectUri) => {
      const config = await getOidcConfiguration(getEnvConfig());
      return buildAuthorizationUrl(config, redirectUri);
    },
    exchangeAuthorizationCode: async (currentUrl, checks) => {
      const config = await getOidcConfiguration(getEnvConfig());
      return authorizationCodeGrant(config, currentUrl, checks);
    },
    sessionSeal: {
      seal: (session) => getSessionSeal().seal(session),
      unseal: (raw) => getSessionSeal().unseal(raw),
    },
    get txSealKey() {
      return getSecrets().sessionSealKey;
    },
    roleMapConfig: loadRoleMapConfigFromEnv(),
    partnerClaimConfig: loadPartnerClaimConfigFromEnv(),
    partnerRepository,
    sessionTtlSeconds: Number(process.env['SESSION_TTL_SECONDS'] ?? '3600'),
    get redirectUri() {
      return getEnvConfig().redirectUri;
    },
    get postLogoutRedirectUri() {
      return process.env['WEBVIEW_LOGIN_URL'];
    },
    endSession: async ({ postLogoutRedirectUri, idTokenHint }) => {
      const config = await getOidcConfiguration(getEnvConfig());
      return buildEndSessionUrl(config, {
        postLogoutRedirectUri,
        ...(idTokenHint !== undefined ? { idTokenHint } : {}),
      });
    },
    secureCookies,
  };
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Frontera `/api/*` (BFF, feature 004) — montada ANTES del catch-all SSR para
 * que ninguna ruta de API caiga al render de Angular (D1).
 */
const partnerRepository = createPartnerRepository();
const authRouterDeps = createAuthRouterDeps(partnerRepository);
// Una sola instancia: subir (POST /api/admin/assets) y servir (/assets/:key) comparten backend.
const assetStorage = createAssetStorage();

/**
 * Sirve los binarios de marca subidos (`/assets/:key`) — montado ANTES del catch-all
 * SSR para que no caiga al render de Angular. Contrato estable, migrable a bucket/CDN
 * sin tocar los datos (ver `createAssetStorage`).
 */
app.use('/assets', createAssetsRouter(assetStorage));

app.use(
  '/api',
  createApiRouter({
    partnerRepository,
    secretResolver: createSecretResolver(),
    adminAuthGuard: createSessionAdminAuthGuard({ unseal: authRouterDeps.sessionSeal.unseal }),
    assetStorage,
    authRouterDeps,
    webviewLoginOrigins: (process.env['WEBVIEW_LOGIN_ORIGIN'] ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    // Cadena real de contact-info (Cardif). Parametrizadas por environment del
    // servidor; sin default para no apuntar a un host equivocado en silencio.
    masheryAuthConfig: { authBaseUrl: process.env['MASHERY_AUTH_BASEURL'] ?? '' },
    contactInfoConfig: { customerBaseUrl: process.env['CUSTOMER_API_BASEURL'] ?? '' },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
