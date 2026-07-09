import { randomUUID } from 'node:crypto';

/**
 * Vocabulario PRD 06; `save_version` se conserva por compatibilidad con filas
 * históricas (D8). `cross_partner_denied` es el evento de seguridad de
 * aislamiento por partner (007, D5).
 */
export type AuditAction =
  | 'create'
  | 'save_version'
  | 'update'
  | 'publish'
  | 'deactivate'
  | 'activate'
  | 'cross_partner_denied';
export type AuditEntity = 'partner' | 'partner_theme' | 'access';

/** Diff concreto campo → antes/después (FR-008, US3 esc.1). */
export type AuditDiff = Record<string, { from: unknown; to: unknown }>;

export interface AuditEntry {
  id: string;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  actorSub: string;
  actorName: string;
  diff?: string;
  themeVersion?: number;
  at: string;
}

/** Alinea el vocabulario del repo (`save_version`) con el de PRD 06 (`update`) sin romper filas históricas. */
export function normalizeAuditAction(action: AuditAction): AuditAction {
  return action === 'save_version' ? 'update' : action;
}

/**
 * Construye una fila de auditoría completa (id/at por defecto) sin tocar
 * persistencia — el SQL vive exclusivamente en el adaptador (FR-020). El
 * llamador debe escribirla en la MISMA transacción que la mutación (FR-022).
 */
export function createAuditEntry(
  entry: Omit<AuditEntry, 'id' | 'at'> & Partial<Pick<AuditEntry, 'id' | 'at'>>,
): AuditEntry {
  return {
    id: entry.id ?? randomUUID(),
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    actorSub: entry.actorSub,
    actorName: entry.actorName,
    diff: entry.diff,
    themeVersion: entry.themeVersion,
    at: entry.at ?? new Date().toISOString(),
  };
}
