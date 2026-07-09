import type { Partner, NewPartner, PartnerQuery } from '../../shared/partner/partner-model.ts';
import type { PartnerTheme, NewThemeVersion } from '../../shared/partner/partner-theme-model.ts';
import type { AuditEntry } from './audit.ts';

export interface AuditQuery {
  /** Filtro por partner/entidad (US4 esc.1). */
  entityId?: string;
  /** Filtro por actor técnico (US4 esc.2). */
  actorSub?: string;
  /** ISO-8601 inclusive — `at >= from`. */
  from?: string;
  /** ISO-8601 inclusive — `at <= to`. */
  to?: string;
  limit?: number;
  offset?: number;
}

export type RepositoryError =
  | { kind: 'UniqueSlug'; slug: string }
  | { kind: 'UniquePartnerKey'; partnerKey: string }
  | { kind: 'NotFound'; entity: 'partner' | 'partner_theme'; id: string }
  | { kind: 'Conflict'; message: string };

export class RepositoryErrorException extends Error {
  readonly error: RepositoryError;

  constructor(error: RepositoryError) {
    super(RepositoryErrorException.messageFor(error));
    this.error = error;
  }

  private static messageFor(error: RepositoryError): string {
    switch (error.kind) {
      case 'UniqueSlug':
        return `slug already exists: ${error.slug}`;
      case 'UniquePartnerKey':
        return `partnerKey already exists: ${error.partnerKey}`;
      case 'NotFound':
        return `${error.entity} not found: ${error.id}`;
      case 'Conflict':
        return error.message;
    }
  }
}

export interface PartnerRepository {
  /** Slugs de partners ACTIVOS. Fuente para el guard de ruteo (feature 001). */
  findActiveSlugs(): Promise<string[]>;

  /** Partner por slug, o null si no existe. (Estado active/inactive incluido.) */
  findBySlug(slug: string): Promise<Partner | null>;

  /** Partner por id, o null si no existe. (Back Office, PRD 05.) */
  findById(id: string): Promise<Partner | null>;

  /** Theme por id (cualquier estado, publicado o borrador), o null si no existe. (Back Office, PRD 05.) */
  getThemeById(themeId: string): Promise<PartnerTheme | null>;

  /** Última versión en borrador (`publishedAt == null`) de un partner, o null si no hay. (Back Office, PRD 05.) */
  getLatestDraftTheme(partnerId: string): Promise<PartnerTheme | null>;

  /**
   * Theme PUBLICADO vigente de un partner ACTIVO, por slug.
   * Devuelve null si: el partner no existe, está inactive, o no tiene ninguna
   * versión publicada (solo borradores). Nunca devuelve un borrador. (FR-011)
   */
  getPublishedTheme(slug: string): Promise<PartnerTheme | null>;

  /** Listado paginado del catálogo. Excluye el partner del sistema __default__. */
  listPartners(query: PartnerQuery): Promise<Partner[]>;

  /**
   * Alta: persiste el Partner (status active, themeId null) + su PartnerTheme v1
   * en BORRADOR, ATÓMICAMENTE, junto con su fila de audit_log. (US1, FR-022)
   * Rechaza si el slug ya existe (unicidad, FR-002) — error tipado UniqueSlug.
   */
  createPartner(
    input: NewPartner,
    firstTheme: NewThemeVersion,
    actorName?: string,
  ): Promise<{ partner: Partner; theme: PartnerTheme }>;

  /**
   * Guarda una NUEVA versión de theme (version = max+1) en BORRADOR, sin tocar
   * la publicada vigente, + audit_log, atómicamente. (US3 esc.1, FR-010/022)
   */
  saveThemeVersion(partnerId: string, theme: NewThemeVersion, actorName?: string): Promise<PartnerTheme>;

  /**
   * Publica una versión existente: mueve Partner.themeId a themeId y sella
   * publishedAt, + audit_log, atómicamente. Rollback = llamar con una versión
   * anterior existente (no se pierde historial). (US3 esc.2/3, FR-012/013/022)
   * Rechaza si themeId no pertenece a partnerId — error tipado NotFound.
   */
  publishThemeVersion(partnerId: string, themeId: string, actorName?: string): Promise<void>;

  /**
   * Baja LÓGICA: status = inactive (nunca DELETE físico), + audit_log,
   * atómicamente. (FR-003/022)
   */
  deactivatePartner(partnerId: string, actorName?: string): Promise<void>;

  /** Reactivación lógica: status = active, + audit_log, atómicamente. (Back Office, PRD 05, FR-015/016.) */
  activatePartner(partnerId: string, actorName?: string): Promise<void>;

  /** Historial de auditoría, más reciente primero (PRD 06 §Back Office). */
  listAuditLog(query: AuditQuery): Promise<AuditEntry[]>;

  /**
   * Registra un intento de acceso cruzado entre partners (007, D5, FR-011) como
   * un append-only más en `audit_log` (`entity:'access'`,
   * `action:'cross_partner_denied'`). No hay mutación que envolver — no es
   * transaccional.
   */
  appendAccessDenied(event: { actorSub: string; actorName: string; attemptedSlug: string }): Promise<void>;
}
