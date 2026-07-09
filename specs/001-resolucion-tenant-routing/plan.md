# Implementation Plan: Resolución de Tenant y Routing

**Branch**: `001-resolucion-tenant-routing` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-resolucion-tenant-routing/spec.md`

## Summary

Resolver, a partir de la URL, **qué partner (banco) corresponde** y presentar su
experiencia bajo la identidad correcta, o caer de forma segura a una **landing
neutra** con la identidad por defecto cuando el primer segmento no matchea un
partner activo, es una ruta reservada, o la fuente de datos falla.

El núcleo es una **función pura y determinista** `resolveTenant({ pathname, host? })`
que clasifica la URL en cuatro formas (`partner` | `reserved` | `root` | `fallback`).
Alrededor de ella:

- un **`CanMatchFn`** (`tenantMatch`) aplica esa función a la ruta `:partnerSlug`,
  valida el slug contra la **lista de partners activos** (estado de servidor vía
  **TanStack Query** → BFF, con frescura acotada por `staleTime` = TTL), y publica
  el `partnerSlug` resuelto como **estado síncrono** en un **NgRx SignalStore**
  transversal (`core/store/tenant.store.ts`);
- las **rutas reservadas** (`admin`, `api`, …) se declaran antes de `:partnerSlug`
  y tienen precedencia; el resto de casos (desconocido, inactivo, charset/longitud
  inválidos, fuente caída) caen a la **landing neutra** (`**`), con respuesta
  uniforme y sin exponer la causa.

La resolución se diseña **extensible a `host`** (subdominios futuros) sin reescribir
consumidores, y el diseño es coherente con SSR (resolver puro re-ejecutable de forma
idempotente en cliente), aunque el cableado SSR y el anti-FOUC/theming pertenecen a
PRD 03/06 y quedan fuera de esta feature.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict) sobre Angular 20.3

**Primary Dependencies**: Angular Router, `@ngrx/signals` 20.1 (SignalStore, estado
síncrono), `@tanstack/angular-query-experimental` 5.101 (estado de servidor/caché),
`HttpClient` de Angular (única capa HTTP — sin axios), Tailwind CSS v4

**Storage**: N/A. La **lista de partners activos** es estado de servidor obtenido del
BFF (PRD 04) vía TanStack Query — no hay persistencia local. La **lista de nombres
reservados** es configuración **versionada en código** (constante), no datos de
runtime.

**Testing**: Karma + Jasmine, `*.spec.ts` colocado junto al fuente (default de
Angular CLI, `ARCHITECTURE.md §9`). El grueso de la cobertura es de **tests
unitarios de la función pura** `resolveTenant` (todos los casos de SC-006).

**Target Platform**: Web (navegador). El resolver es determinista y apto para SSR;
el **cableado SSR no se realiza en esta feature** (no hay builder SSR en
`angular.json` hoy) y se delega a PRD 03/06.

**Project Type**: Aplicación web Angular de proyecto único (frontend).

**Performance Goals**: Resolución local trivial (parseo del primer segmento +
lookup en un `Set`). La lista de partners activos se sirve desde caché de TanStack
Query dentro de la ventana de frescura (TTL), evitando refetch en navegación intra-
partner (FR-008, SC-004). Render inicial sin parpadeo de theme (FR-009) — el
mecanismo de anti-FOUC es PRD 03; aquí solo se garantiza un resultado determinista.

**Constraints**: Proyecto **zoneless** + `OnPush` (Constitución IV). Resolver
**determinista e idempotente** (FR-010). **Fail-safe**: fuente inaccesible ⇒
fallback indistinguible de slug desconocido (FR-014). **Anti-enumeración**:
respuesta de fallback uniforme, la raíz no lista partners (FR-004, FR-007, SC-003).

**Scale/Scope**: Decenas de partners; ~8 nombres reservados; 4 formas de resolución.
Superficie de UI mínima en esta feature (landing neutra + shell de partner de
validación); journey/theming/back-office son otras features.

## Constitution Check

*GATE: Debe pasar antes de Phase 0. Re-evaluado tras Phase 1 (ver final).*

**I. Estado y Datos — Separación Síncrono/Asíncrono** — ✅ CUMPLE
- La **lista de partners activos** es estado de servidor: se consume **solo** vía
  TanStack Query (`queries/partners-queries.ts` → `PartnersApiService` → `HttpClient`).
  Nunca se modela en el Store.
- El **`partnerSlug` resuelto** es estado **síncrono** de UI/sesión → NgRx
  SignalStore transversal (`core/store/tenant.store.ts`), como `tema/idioma`
  (`ARCHITECTURE.md §2`).
- **Sin axios**; el único punto HTTP es `PartnersApiService` sobre `HttpClient`.
- El **guard** (`tenantMatch`) no inyecta `HttpClient` ni el `*ApiService`: lee la
  caché de servidor mediante `QueryClient.ensureQueryData(...)` con las
  `queryOptions` de `queries/` (disciplina de capas del `ARCHITECTURE.md §3`).

**II. Componentes Standalone y OnPush** — ✅ CUMPLE
- `Landing` y el shell de partner de validación son standalone (sin
  `standalone: true` explícito) con `ChangeDetectionStrategy.OnPush`.
- Sin formularios en esta feature (no aplica Reactive Forms); sin `ngClass`/`ngStyle`;
  sin `@HostBinding`/`@HostListener`.

**III. Inyección de Dependencias** — ✅ CUMPLE
- Solo `inject()` (en guard, store, api, queries, componentes). Servicios/queries/
  store singleton `providedIn: 'root'`.

**IV. Estilos y Zoneless** — ✅ CUMPLE
- Estilos solo con utilidades Tailwind v4. Sin dependencia de `zone.js`/`NgZone`;
  la UI se actualiza vía signals (store) + `OnPush`. El resolver es lógica pura sin
  detección de cambios implícita.

**Resultado del gate**: PASA sin violaciones. La tabla **Complexity Tracking** queda
vacía.

## Project Structure

### Documentation (this feature)

```text
specs/001-resolucion-tenant-routing/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Phase 0 (/speckit-plan)
├── data-model.md        # Phase 1 (/speckit-plan)
├── quickstart.md        # Phase 1 (/speckit-plan)
├── contracts/           # Phase 1 (/speckit-plan)
│   ├── resolve-tenant.contract.md
│   └── partners-source.contract.md
├── checklists/
│   └── requirements.md  # Ya existente (calidad de la spec)
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Estructura feature-first (`ARCHITECTURE.md §1`). La **resolución de tenant es
transversal** (no la posee un feature de negocio, igual que `tema/idioma` →
`core/`); la **lista de partners** es la fuente de datos de servidor, y la
**landing neutra** es la superficie de fallback/raíz.

```text
src/app/
  core/
    tenant/                         # kernel de resolución (puro, sin Angular salvo el guard)
      slug.ts                       # normalizeSlug(raw): string | null  (FR-002)
      slug.spec.ts
      reserved-names.ts             # RESERVED_NAMES (versionado) + isReservedSegment() (FR-005)
      reserved-names.spec.ts
      tenant-resolution-model.ts    # TenantResolution (unión discriminada) + TenantInput (FR-011, FR-013)
      resolve-tenant.ts             # resolveTenant(input, activeSlugs): TenantResolution  (FR-001..007, 010)
      resolve-tenant.spec.ts        # cobertura de TODOS los casos de SC-006
      tenant-guard.ts               # tenantMatch: CanMatchFn (valida activos + publica en store) (FR-003,008,014)
      tenant-guard.spec.ts
    store/
      tenant.store.ts               # estado síncrono del tenant resuelto (providedIn root) (FR-008, PRD 06)
      tenant.store.spec.ts
  features/
    partners/                       # fuente de datos de servidor: lista de partners activos
      models/
        partner-model.ts            # Partner, PartnerSlug, PartnerStatus
      services/
        partners-api.ts             # PartnersApiService (envuelve HttpClient → BFF) (FR-005/RF-01.5)
        partners-api.spec.ts
      queries/
        partners-queries.ts         # queryOptions activePartners (staleTime = TTL) (FR-015)
    landing/
      landing.ts                    # landing neutra: fallback + raíz, theme default, sin listar partners (FR-004,006)
      landing.spec.ts
    partner-shell/                  # superficie mínima de validación de partner válido (placeholder de journey/theming)
      partner-shell.ts
  app.routes.ts                     # composición: reservadas → :partnerSlug (CanMatch) → '' → '**'  (FR-005 precedencia)
  app.config.ts                     # ya cablea provideHttpClient + provideTanStackQuery (sin cambios de wiring nuevos)
```

**Structure Decision**: Proyecto único Angular. El **kernel de resolución** y el
**store síncrono** viven en `core/` por ser transversales (no pertenecen al dominio
de ningún feature de negocio, criterio explícito de `ARCHITECTURE.md §2` para
`tema/idioma`). La **fuente de datos** (`features/partners/`) sigue la convención
`services/` + `queries/` + `models/` por feature (`ARCHITECTURE.md §1/§3`). La
**landing** y el **partner-shell** de validación son features de UI mínimos. El
`tenantMatch` (`CanMatchFn`) se ubica junto al kernel en `core/tenant/` porque es el
punto de entrada de routing de la resolución. `admin`/`api` (Back Office/BFF) son
rutas reservadas de PRD 04/05: en esta feature se registran como **placeholders**
suficientes para garantizar su precedencia sobre `:partnerSlug`.

## Complexity Tracking

> Sin violaciones de la Constitución. Tabla intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
