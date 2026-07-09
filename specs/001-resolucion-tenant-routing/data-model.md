# Phase 1 — Data Model: Resolución de Tenant y Routing

Modela las entidades de `spec.md §Key Entities` como tipos TypeScript y estado. No
hay persistencia (Storage = N/A): las entidades son de **dominio en memoria**
(constantes versionadas) o **proyecciones de estado de servidor** (lista de partners
activos, vía TanStack Query). Las firmas son el contrato de referencia; el código
final vive en `src/app/core/tenant/` y `src/app/features/partners/`.

---

## 1. `TenantInput` — entrada de la resolución

Fuente extensible de la resolución (D2, FR-013).

| Campo | Tipo | Notas |
|-------|------|-------|
| `pathname` | `string` | Ruta de la URL (`/popular/oferta`). Único usado hoy. |
| `host` | `string \| undefined` | Reservado para subdominios futuros. No se usa aún. |

```ts
export interface TenantInput {
  readonly pathname: string;
  readonly host?: string;
}
```

## 2. `TenantResolution` — resultado de la resolución (unión discriminada)

Cuatro formas mutuamente excluyentes (FR-011, PRD 01 §3). El discriminante es `kind`.

```ts
export type ReservedArea = 'admin' | 'api' | 'assets' | 'static' | 'health' | 'system';
export type FallbackReason = 'unknown-slug' | 'inactive';

export type TenantResolution =
  | { readonly kind: 'partner'; readonly slug: string }
  | { readonly kind: 'reserved'; readonly area: ReservedArea }
  | { readonly kind: 'root' }
  | { readonly kind: 'fallback'; readonly reason: FallbackReason };
```

| Forma | Cuándo | Campos |
|-------|--------|--------|
| `partner` | 1er segmento normaliza y ∈ activos | `slug` (normalizado) |
| `reserved` | 1er segmento crudo ∈ reservados | `area` (a qué sistema pertenece) |
| `root` | sin 1er segmento (`/`) | — |
| `fallback` | desconocido / inactivo / inválido / fuente caída | `reason` (motivo **interno**) |

**Reglas de invariante**
- `slug` en forma `partner` cumple SIEMPRE `^[a-z0-9-]{2,40}$` (ya normalizado).
- `reason` es motivo **interno** (FR-011) para la capa de observabilidad futura;
  **no** debe influir en lo que ve el usuario: `unknown-slug` e `inactive` producen
  UI idéntica (FR-007, SC-003). En esta feature, con fuente de solo-activos, el
  resolver emite `unknown-slug` para ambos (research D3).
- La resolución es **determinista e idempotente**: igual `TenantInput` + igual
  conjunto de activos ⇒ igual `TenantResolution` (FR-010).

## 3. `Partner` — socio/banco (proyección de estado de servidor)

Entidad de negocio servida por el BFF (PRD 02/04). Esta feature la **consume** para
construir el conjunto de slugs activos; no la administra.

| Campo | Tipo | Notas |
|-------|------|-------|
| `slug` | `PartnerSlug` (`string`) | Identificador kebab-case único. |
| `status` | `PartnerStatus` | `'active' \| 'inactive'`. |
| `displayName` | `string` (opcional aquí) | No requerido por la resolución. |

```ts
export type PartnerSlug = string;            // kebab-case, [a-z0-9-]{2,40}
export type PartnerStatus = 'active' | 'inactive';

export interface Partner {
  readonly slug: PartnerSlug;
  readonly status: PartnerStatus;
  readonly displayName?: string;
}
```

**Nota**: el BFF puede exponer directamente la **lista de activos** (solo `slug`s
activos) — ver contrato `partners-source.contract.md`. En ese caso `Partner.status`
no viaja al cliente y no hay forma de distinguir "inactivo" de "inexistente"
(refuerza SC-003 por diseño).

## 4. `ActivePartnerSlugs` — lista de partners activos (fuente de verdad)

Conjunto vigente de slugs habilitados contra el que se valida cada candidato.

- **Tipo de consumo**: `ReadonlySet<PartnerSlug>` (lookup O(1) en el resolver).
- **Origen**: BFF vía TanStack Query (`partners-queries.activePartners()`).
- **Frescura**: acotada por TTL = `staleTime` (default 60 s, configurable — D8,
  FR-015). Una desactivación surte efecto dentro de esa ventana.
- **Fail-safe**: si la fuente falla, el consumidor (guard) trata la resolución como
  `fallback`, sin exponer la indisponibilidad (FR-014, D9).

## 5. `RESERVED_NAMES` — nombres reservados (constante versionada)

Conjunto versionado de primeros segmentos que nunca pueden ser un partner y tienen
**precedencia** sobre la resolución de partner (FR-005).

- **Tipo**: `ReadonlySet<string>` en `core/tenant/reserved-names.ts`.
- **Valores**: `admin`, `api`, `assets`, `static`, `health`, `_next`,
  `favicon.ico`, `robots.txt`.
- **Comparación**: exacta, **case-insensitive** sobre el segmento crudo minusculizado,
  **antes** de normalizar (FR-005, clarificación 5).
- **Doble uso**: alimenta la resolución (D3) **y** la validación de alta de partners
  del Back Office (FR-012, PRD 05) — misma fuente de verdad, sin duplicación.

```ts
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'admin', 'api', 'assets', 'static', 'health', '_next', 'favicon.ico', 'robots.txt',
]);
```

## 6. `TenantState` — estado síncrono del tenant resuelto

Estado de UI/sesión (NgRx SignalStore, `core/store/tenant.store.ts`, D7). Habilita la
reutilización durante el journey (FR-008) sin re-resolver.

| Campo | Tipo | Notas |
|-------|------|-------|
| `resolution` | `TenantResolution \| null` | Última resolución publicada; `null` antes de resolver. |

Derivados (`withComputed`): `partnerSlug` (`string \| null`, solo si `kind==='partner'`),
`isPartner`, `isFallback`. El store es síncrono; **nunca** almacena la lista de
partners (eso es TanStack Query — Constitución I).

---

## Relaciones

```
TenantInput ──resolveTenant(input, ActivePartnerSlugs)──▶ TenantResolution
                              ▲                                   │
                              │                                   ▼
                    RESERVED_NAMES (precede)             TenantStore.resolution (síncrono)
                              ▲                                   ▲
        ActivePartnerSlugs ◀─ derivado de Partner[] (BFF, TanStack Query, TTL)
```

- `resolveTenant` es pura: combina `TenantInput` + `RESERVED_NAMES` + `ActivePartnerSlugs`.
- `ActivePartnerSlugs` se deriva de `Partner[]` (o lista de slugs) del BFF.
- La `TenantResolution` resultante se publica en `TenantStore` (síncrono) para el
  resto de la app.
