import type { IntegrationCreds, SecretResolver } from './secret-resolver.ts';

const DEFAULT_TTL_MS = 30_000;

/** Endpoint único de Mashery, compartido por todos los partners (no varía por slug). */
const MASHERY_BASEURL_ENV_VAR = 'MASHERY_BASEURL';

interface CacheEntry {
  readonly creds: IntegrationCreds | null;
  readonly expiresAt: number;
}

function envKeyFor(slug: string): string {
  return slug.toUpperCase().replace(/-/g, '_');
}

function readCredsFromEnv(slug: string): IntegrationCreds | null {
  const baseUrl = process.env[MASHERY_BASEURL_ENV_VAR];
  const apiKey = process.env[`PARTNER_${envKeyFor(slug)}_APIKEY`];

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { baseUrl, apiKey };
}

/**
 * Adaptador V1 de `SecretResolver`: `baseUrl` viene de una única variable de
 * entorno global (`MASHERY_BASEURL`, Mashery compartido); `apiKey` se
 * lee por slug (`PARTNER_<SLUG>_APIKEY`, credencial propia de cada partner
 * contra ese mismo Mashery). Caché de TTL corto + invalidación (D3/D4, FR-003/005/006).
 */
export class EnvSecretResolver implements SecretResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  async resolve(slug: string): Promise<IntegrationCreds | null> {
    const cached = this.cache.get(slug);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.creds;
    }

    const creds = readCredsFromEnv(slug);
    this.cache.set(slug, { creds, expiresAt: now + this.ttlMs });
    return creds;
  }

  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  async isConfigured(slug: string): Promise<boolean> {
    return (await this.resolve(slug)) !== null;
  }
}

export function createSecretResolver(ttlMs?: number): SecretResolver {
  return new EnvSecretResolver(ttlMs);
}
