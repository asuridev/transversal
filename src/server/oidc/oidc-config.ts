import * as client from 'openid-client';

export interface OidcEnvConfig {
  readonly issuerUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

/** Carga la config de entorno del cliente OIDC (D1/D12) — sin valores hardcoded. */
export function loadOidcEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
  clientSecret?: string,
): OidcEnvConfig {
  const issuerUrl = env['OIDC_ISSUER_URL'];
  const clientId = env['OIDC_CLIENT_ID'];
  const redirectUri = env['OIDC_REDIRECT_URI'];
  const secret = clientSecret ?? env['OIDC_CLIENT_SECRET'];

  if (!issuerUrl || !clientId || !redirectUri || !secret) {
    throw new Error('Configuración OIDC incompleta (OIDC_ISSUER_URL/OIDC_CLIENT_ID/OIDC_REDIRECT_URI/OIDC_CLIENT_SECRET)');
  }

  return {
    issuerUrl,
    clientId,
    clientSecret: secret,
    redirectUri,
  };
}

let cached: Promise<client.Configuration> | null = null;

/** Discovery del issuer (RH-SSO 7.6, base `/auth`), cacheado por arranque (D1/D12). */
export function getOidcConfiguration(env: OidcEnvConfig): Promise<client.Configuration> {
  if (!cached) {
    const isHttps = env.issuerUrl.startsWith('https:');
    cached = client.discovery(new URL(env.issuerUrl), env.clientId, env.clientSecret, undefined, {
      // Solo dev/local (IdP sin TLS, p. ej. podman-compose en localhost). En
      // prod el issuer es HTTPS y esta opción no se aplica (D11/D12).
      ...(isHttps ? {} : { execute: [client.allowInsecureRequests] }),
    });
  }
  return cached;
}

/** Solo para tests: fuerza una nueva discovery en la siguiente llamada. */
export function resetOidcConfigurationCache(): void {
  cached = null;
}
