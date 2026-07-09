export type AppRole = 'platform-admin' | 'partner-editor' | 'auditor';

/** Mapeo claim→rol config-driven (D5, FR-004) — nunca hardcode. */
export interface RoleMapConfig {
  /** Ruta al claim de roles en el ID/Access token (p. ej. "realm_access.roles"). */
  readonly roleClaimPath: string;
  /** claim del IdP → rol de aplicación. No incluido ⇒ ignorado (menor privilegio). */
  readonly roleMap: Readonly<Record<string, AppRole>>;
}

function readClaimPath(claims: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, claims);
}

/** `claims[roleClaimPath] → ROLE_MAP → dedupe`; sin match ⇒ `[]` (menor privilegio, D5). */
export function deriveRoles(claims: unknown, config: RoleMapConfig): AppRole[] {
  const rawValue = readClaimPath(claims, config.roleClaimPath);
  const rawRoles = Array.isArray(rawValue) ? rawValue : [];

  const roles: AppRole[] = [];
  for (const raw of rawRoles) {
    if (typeof raw !== 'string') {
      continue;
    }
    const mapped = config.roleMap[raw];
    if (mapped && !roles.includes(mapped)) {
      roles.push(mapped);
    }
  }
  return roles;
}

/** Carga `RoleMapConfig` desde entorno (`ROLE_CLAIM_PATH`, `ROLE_MAP` JSON) — D5, D12. */
export function loadRoleMapConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RoleMapConfig {
  const roleClaimPath = env['ROLE_CLAIM_PATH'] ?? 'realm_access.roles';
  const roleMapJson = env['ROLE_MAP'] ?? '{}';
  const roleMap = JSON.parse(roleMapJson) as Record<string, AppRole>;
  return { roleClaimPath, roleMap };
}
