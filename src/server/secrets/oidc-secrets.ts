/**
 * Secretos globales del BFF de OIDC/sesión (D12) — mismo patrón que
 * `env-secret-resolver.ts`: se leen de entorno server-side y nunca cruzan al
 * bundle/cliente (FR-002, PRD 04 §5). A diferencia de `SecretResolver`
 * (por-partner), estos son globales al proceso del BFF.
 */
export interface OidcSecrets {
  readonly clientSecret: string;
  readonly sessionSealKey: string;
}

/** Lanza si falta alguno — sin ellos el BFF no puede mediar OIDC/sesión con seguridad. */
export function resolveOidcSecrets(): OidcSecrets {
  const clientSecret = process.env['OIDC_CLIENT_SECRET'];
  const sessionSealKey = process.env['SESSION_SEAL_KEY'];

  if (!clientSecret) {
    throw new Error('OIDC_CLIENT_SECRET no configurado');
  }
  if (!sessionSealKey) {
    throw new Error('SESSION_SEAL_KEY no configurado');
  }

  return { clientSecret, sessionSealKey };
}
