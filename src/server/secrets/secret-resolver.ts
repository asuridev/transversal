/** Credenciales de integración de un partner, resueltas server-side. Nunca cruzan al cliente (FR-003/005/006). */
export interface IntegrationCreds {
  /** Endpoint único de Mashery, compartido por todos los partners (no varía por slug). */
  readonly baseUrl: string;
  /** Credencial propia de ESTE partner contra ese mismo Mashery. */
  readonly apiKey: string;
  readonly extra?: Readonly<Record<string, string>>;
}

export interface SecretResolver {
  /** Resuelve creds del partner por slug, o `null` si no está configurado. Cachea con TTL corto. */
  resolve(slug: string): Promise<IntegrationCreds | null>;
  /** Fuerza relectura del gestor de secretos en la próxima resolución (rotación, FR-006). */
  invalidate(slug: string): void;
  /** Solo metadatos para admin: ¿Mashery está configurado y este partner tiene su apiKey? Nunca el valor (FR-016). */
  isConfigured(slug: string): Promise<boolean>;
}
