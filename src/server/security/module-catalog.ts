import type { AppRole } from './role-map.ts';

/** Entrada del catálogo de módulos server-side (D3, FR-010/011) — moduleId → ruta interna curada. */
export interface ModuleCatalogEntry {
  readonly moduleId: string;
  readonly route: string;
  readonly requiredRoles?: readonly AppRole[];
  readonly requiresPartner?: boolean;
}

export interface ModuleAvailabilityContext {
  readonly roles: readonly AppRole[];
  readonly hasPartner: boolean;
}

function isSafeRoute(route: string): boolean {
  return route.startsWith('/') && !route.startsWith('//');
}

/**
 * moduleId → ruta interna, solo si existe y está disponible para `ctx`
 * (D3, FR-010/011). Nunca devuelve una ruta propuesta por el cliente:
 * el catálogo es la única fuente de rutas.
 */
export function resolveModuleRoute(
  moduleId: string,
  ctx: ModuleAvailabilityContext,
  catalog: readonly ModuleCatalogEntry[] = MODULE_CATALOG,
): string | null {
  const entry = catalog.find((candidate) => candidate.moduleId === moduleId);
  if (!entry || !isSafeRoute(entry.route)) {
    return null;
  }
  if (entry.requiredRoles && !entry.requiredRoles.some((role) => ctx.roles.includes(role))) {
    return null;
  }
  if (entry.requiresPartner && !ctx.hasPartner) {
    return null;
  }
  return entry.route;
}

/** `true` si `moduleId` existe en el catálogo (validación básica en `/auth/login`, sin claims aún). */
export function moduleExists(moduleId: string, catalog: readonly ModuleCatalogEntry[] = MODULE_CATALOG): boolean {
  return catalog.some((entry) => entry.moduleId === moduleId);
}

/**
 * Catálogo curado de módulos (US3, T018) — moduleId → ruta real de la
 * transversal. Hoy el único destino autenticado en este front es `/admin`
 * (roleGuard: platform-admin/partner-editor/auditor); el journey de venta se
 * consume vía API (`/api/journey/*`) desde otra app y no tiene ruta propia
 * aquí, por lo que no se inventan `moduleId`s para páginas inexistentes.
 */
export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  { moduleId: 'admin', route: '/admin', requiredRoles: ['platform-admin', 'partner-editor', 'auditor'] },
];
