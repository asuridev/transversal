/** Config del claim de partner (D1, FR-001/008) — nunca hardcode. */
export interface PartnerClaimConfig {
  /** Ruta al claim de partner en el ID/Access token (p. ej. "partner"). */
  readonly partnerClaimPath: string;
}

function readClaimPath(claims: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, claims);
}

/**
 * `claims[partnerClaimPath] → slug único`; cardinalidad exactamente-uno
 * (D1, FR-001/008). Ausente, vacío, tipo inválido o **múltiple** ⇒ `null`
 * (menor privilegio — nunca se elige uno arbitrariamente).
 */
export function derivePartnerRef(claims: unknown, config: PartnerClaimConfig): string | null {
  const rawValue = readClaimPath(claims, config.partnerClaimPath);

  if (typeof rawValue === 'string') {
    return rawValue.length > 0 ? rawValue : null;
  }

  if (Array.isArray(rawValue)) {
    const values = rawValue.filter((v): v is string => typeof v === 'string' && v.length > 0);
    return values.length === 1 ? values[0]! : null;
  }

  return null;
}

/** Carga `PartnerClaimConfig` desde entorno (`PARTNER_CLAIM_PATH`) — D1/D8. */
export function loadPartnerClaimConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PartnerClaimConfig {
  const partnerClaimPath = env['PARTNER_CLAIM_PATH'] ?? 'partner';
  return { partnerClaimPath };
}
