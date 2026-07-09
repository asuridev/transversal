# Contract — Puerto `PartnerRepository`

**Único límite de acceso a datos** (FR-020). El dominio y los handlers del BFF
dependen **solo** de este puerto; **nunca** de SQL ni de un motor concreto. El SQL
vive **exclusivamente** en el adaptador (`sqlite/…`, futuro `postgres/…`).
Ubicación: `src/server/persistence/partner-repository.ts`.

## Interface

```typescript
import type {
  Partner, NewPartner, PartnerQuery,
  PartnerTheme, NewThemeVersion,
} from '../../shared/partner/partner-model';

export interface PartnerRepository {
  // ── Lecturas (experiencia / resolución de tenant) ──────────────────────────
  /** Slugs de partners ACTIVOS. Fuente para el guard de ruteo (feature 001). */
  findActiveSlugs(): Promise<string[]>;

  /** Partner por slug, o null si no existe. (Estado active/inactive incluido.) */
  findBySlug(slug: string): Promise<Partner | null>;

  /**
   * Theme PUBLICADO vigente de un partner ACTIVO, por slug.
   * Devuelve null si: el partner no existe, está inactive, o no tiene ninguna
   * versión publicada (solo borradores). Nunca devuelve un borrador. (FR-011)
   */
  getPublishedTheme(slug: string): Promise<PartnerTheme | null>;

  // ── Back Office (mutaciones solo-admin) ────────────────────────────────────
  /** Listado paginado del catálogo. Excluye el partner del sistema __default__. */
  listPartners(query: PartnerQuery): Promise<Partner[]>;

  /**
   * Alta: persiste el Partner (status active, themeId null) + su PartnerTheme v1
   * en BORRADOR, ATÓMICAMENTE, junto con su fila de audit_log. (US1, FR-022)
   * Rechaza si el slug ya existe (unicidad, FR-002) — error tipado UniqueSlug.
   * (La validación de formato/reservado se hace ANTES de llamar al puerto.)
   */
  createPartner(input: NewPartner, firstTheme: NewThemeVersion): Promise<{ partner: Partner; theme: PartnerTheme }>;

  /**
   * Guarda una NUEVA versión de theme (version = max+1) en BORRADOR, sin tocar
   * la publicada vigente, + audit_log, atómicamente. (US3 esc.1, FR-010/022)
   */
  saveThemeVersion(partnerId: string, theme: NewThemeVersion): Promise<PartnerTheme>;

  /**
   * Publica una versión existente: mueve Partner.themeId a themeId y sella
   * publishedAt, + audit_log, atómicamente. Rollback = llamar con una versión
   * anterior existente (no se pierde historial). (US3 esc.2/3, FR-012/013/022)
   * Rechaza si themeId no pertenece a partnerId — error tipado NotFound.
   */
  publishThemeVersion(partnerId: string, themeId: string): Promise<void>;

  /**
   * Baja LÓGICA: status = inactive (nunca DELETE físico), + audit_log,
   * atómicamente. (FR-003/022)
   */
  deactivatePartner(partnerId: string): Promise<void>;
}
```

## Errores tipados (no excepciones opacas)

```typescript
export type RepositoryError =
  | { kind: 'UniqueSlug'; slug: string }     // alta con slug duplicado (FR-002)
  | { kind: 'NotFound'; entity: 'partner' | 'partner_theme'; id: string }
  | { kind: 'Conflict'; message: string };   // p.ej. themeId no pertenece al partner
```

El adaptador traduce violaciones del motor (p.ej. `UNIQUE constraint failed`) a
estos errores tipados; el dominio nunca ve mensajes de SQL.

## Reglas del puerto (invariantes de TODO adaptador)

1. **SQL solo en el adaptador.** Ningún consumidor ejecuta consultas directas
   (FR-020). El dominio ve objetos tipados; el adaptador es dueño del **dialecto**
   y del **JSON** (SQLite: `TEXT` + `json_extract()`; Postgres: `JSONB`).
2. **Auditoría transaccional.** Cada mutación y su fila de `audit_log` se escriben
   en la **misma transacción** interna del adaptador (FR-022). `audit_log` no es un
   puerto aparte.
3. **Baja lógica.** `deactivatePartner` cambia estado; **nunca** borra físicamente
   (FR-003). No existe operación de borrado en el puerto.
4. **Slug inmutable.** No hay operación que modifique `slug` (FR-002).
5. **Nunca sirve borradores.** `getPublishedTheme` devuelve **solo** la versión
   publicada vigente (o null); jamás un borrador (FR-011).
6. **`__default__` no se lista.** `listPartners` excluye el partner del sistema
   (FR-019); su theme se obtiene por la ruta de default, no por el catálogo.
7. **Selección por configuración.** El adaptador se elige por `PERSISTENCE_DRIVER`
   en `persistence-config.ts` (FR-021); cambiar de motor = cambiar la variable +
   tener el adaptador. Dominio y handlers no cambian.
8. **Contract-test compartido.** Todo adaptador debe pasar la misma batería
   (`repository-contract-tests.md`) — gate de aceptación (SC-009).

## Factory de selección (wiring)

```typescript
// src/server/persistence/persistence-config.ts
export type PersistenceDriver = 'sqlite' | 'postgres';

export function createPartnerRepository(
  driver: PersistenceDriver = (process.env['PERSISTENCE_DRIVER'] as PersistenceDriver) ?? 'sqlite',
): PartnerRepository {
  switch (driver) {
    case 'sqlite':   return new SqlitePartnerRepository(/* path/opts */);
    case 'postgres': throw new Error('postgres adapter: hito M2 (fuera de esta feature)');
  }
}
```
