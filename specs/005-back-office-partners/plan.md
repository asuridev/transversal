# Implementation Plan: Back Office — Gestión de Partners

**Branch**: `005-back-office-partners` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-back-office-partners/spec.md`

## Summary

Esta feature construye el **panel de administración interno** (feature Angular
`admin`) donde un operador con rol `admin` da de alta partners, edita su marca
con un **editor visual**, **previsualiza en vivo** el resultado sobre una
pantalla real del journey, **publica** versiones de theme y **activa/desactiva**
partners (baja lógica). Es puramente **front-end**: consume los endpoints
`/api/admin/*` que la feature `004` (BFF) ya expone; no crea persistencia, ni
toca object storage o secretos directamente.

Enfoque técnico (fijado por PRD 05, ARCHITECTURE y la Constitución):

1. **Feature lazy `features/admin/`** con layout propio (shell: nav lateral +
   `<router-outlet>`), montada en `app.routes.ts` reemplazando el placeholder
   actual, protegida por `authGuard → roleGuard('admin')` (el guard de rol
   existe como seam; el mecanismo de identidad es PRD 06).
2. **Estado de servidor solo vía TanStack Query** (`admin-queries.ts` →
   `AdminApiService` → `HttpClient`): listado, alta, guardado de versión,
   publicación y activación/desactivación son `injectQuery`/`injectMutation`
   con invalidación de caché. Ningún componente inyecta `HttpClient` (Const. I).
3. **Estado síncrono de UI** (borrador en edición, término de búsqueda) vía
   signals locales + `computed()`; no se crea SignalStore salvo que el borrador
   deba sobrevivir navegación (no lo requiere v1).
4. **Editor de marca** = Reactive Form tipado sobre el contrato `PartnerTheme`
   (tokens, assets, tipografía, legal) de PRD 02, compuesto de átomos
   `shared/components/ui` + un `color-field` con validación de contraste WCAG AA.
5. **Preview en vivo aislado (pieza clave, FR-010/011/012)**: reutiliza el
   proyector de tokens `toCssVars` de `003`, pero **escrito a un contenedor con
   scope propio** (CSS custom properties en el host del `theme-preview`), **no**
   a `:root` ni al `ThemeStore` global — así el preview no "ensucia" el chrome
   del back office. Dentro renderiza los **mismos átomos** (`brand-logo`,
   `brand-footer`, botones/cards de `ui/`) que la experiencia real → fidelidad.
6. **Uploads de assets** vía `asset-uploader` → `POST /api/admin/assets` (el BFF
   valida y sanitiza server-side y aloja en object storage; el bundle nunca ve
   credenciales del bucket). Validación cliente (MIME/tamaño/dimensiones) como
   feedback temprano, no como única barrera.
7. **Sistema visual del panel diseñado desde cero**: no hay Figma del back
   office. Se define un *design language* (chrome del panel) reutilizando los
   átomos `ui/`, **anclado a la identidad BNP Paribas Cardif extraída del Figma**
   "Portal Médicos Cardif" (primario `#00965E`, acento `#93BD0E`, grises de marca,
   tipografía `BNPP Sans`) — usado **solo como guía de estilo** y como fuente de
   la pantalla de journey ("Ofrecimiento del seguro / Personaliza tu seguro")
   usada de lienzo de preview. Tokens completos en
   `contracts/admin-design-language.contract.md`.

Alcance = **la UI del back office y su cableado a `/api/admin/*`**. Quedan
**fuera**: los endpoints/persistencia (son `004`/`002`), el mecanismo de
identidad/SSO y el detalle de auditoría (PRD 06), y edición del journey o lógica
del seguro.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict). Front **Angular 20.3** (standalone,
zoneless, signals), consumido en navegador y renderizado por el mismo servidor
SSR de `003`. Sin cambios de runtime servidor en esta feature.

**Primary Dependencies**:
- **Ya presente (sin instalar)**: `@angular/core`/`router`/`forms` (Reactive
  Forms), `@tanstack/angular-query-experimental` (wiring de `004`), Tailwind v4
  (`@tailwindcss/postcss`).
- **Consumido de otras features (reuso, no reimplementación)**:
  `toCssVars` (`src/app/core/theme/theme-css-vars.ts`, `003`) para el preview;
  átomos `brand-logo`/`brand-footer` (`src/app/features/theming/components/`,
  `003`); el contrato `PublicTheme`/`PartnerTheme`/`ThemeTokens`
  (`src/shared/partner/`, `002`); `roleGuard` (patrón ARCHITECTURE §4; el guard
  concreto es seam de PRD 06); endpoints `/api/admin/*` (`src/server/api/admin-router.ts`, `004`).
- **Nuevo en esta feature (código propio, sin librerías npm nuevas)**:
  `AdminApiService`, `AdminQueries`, componentes `admin-layout`,
  `partners-list`, `partner-create`, `partner-edit`, `brand-editor`,
  `theme-preview`, `color-field`, `asset-uploader`; utilidad de contraste WCAG
  (`contrast-ratio.ts`) y un aplicador de tokens con scope (`scoped-theme.ts`).
  **Cero dependencias npm nuevas** — el picker de color usa `<input type="color">`
  nativo; el cálculo de contraste es aritmética WCAG en-house.

**Storage**: N/A en el front. Todo dato persistente vive tras `/api/admin/*`
(SQLite vía `PartnerRepository`, `002`); assets en object storage vía BFF. El
panel no accede a DB ni bucket directamente.

**Testing**: Karma + Jasmine (`*.spec.ts` colocado junto al fuente, ARCHITECTURE
§9). Unit specs de: proyección de contraste, aplicador de tokens con scope
(aislamiento), reducers de estado de edición, y specs de componente para
`partners-list` (filtro), `partner-create` (validación de slug), `brand-editor`
(dirty/guardar), `color-field` (advertencia AA). El `AdminApiService` se prueba
con `HttpTestingController`. Playwright CLI = verificación manual del agente
(feedback visual del preview y flujos), no CI (ARCHITECTURE §9).

**Target Platform**: Navegador (SPA hidratada por SSR de `003`). El panel corre
client-side; sus datos vienen de `/api/admin/*` mismo-origen.

**Project Type**: Aplicación web Angular de proyecto único con SSR. El código de
esta feature vive en `src/app/features/admin/` (front); no añade código a
`src/server/`.

**Performance Goals**: Cambio de color reflejado en el preview en **<1 s
percibido como instantáneo** (SC-002) — garantizado por signals + `computed()`
que escriben CSS vars al host del preview sin round-trip. Listado con filtro
cliente sobre la query cacheada (sin refetch por tecla).

**Constraints**:
- **Aislamiento del preview (SC-009, FR-011)**: el preview escribe tokens a su
  **propio scope**, nunca a `:root`/`ThemeStore`; editar marca jamás altera el
  chrome del panel.
- **Sin `HttpClient` en componentes (Const. I)**: solo TanStack Query o Store.
- **Sin secretos en el bundle (SC-008)**: el panel nunca recibe credenciales del
  bucket; los uploads pasan por el BFF.
- **Reglas de UI (Const. II/III/IV)**: standalone + `OnPush`, `input()`/`output()`,
  `computed()`, Reactive Forms, `inject()`, sin `ngClass`/`ngStyle`, sin
  `@HostBinding`/`@HostListener`, Tailwind único, zoneless, variantes de átomos
  en vez de clases ad-hoc.
- **Guard de rol (FR-003)**: toda la ruta bajo `authGuard → roleGuard('admin')`;
  acceso denegado antes de exponer datos.
- **Slug (FR-005)**: validación de formato + reservados en cliente (reuso de
  reglas de `001`/`002`) como feedback; la unicidad la resuelve el BFF.

**Scale/Scope**: 1 feature lazy, 1 layout, 3 páginas (`partners-list`,
`partner-create`, `partner-edit`), 4 componentes (`brand-editor`,
`theme-preview`, `color-field`, `asset-uploader`), 1 servicio API, 1 archivo de
queries, 1 modelo de DTOs admin, 2 utilidades (contraste, scoped-theme).
Consume 7 endpoints `/api/admin/*` ya existentes. Sin cambios de contrato en el
BFF.

## Constitution Check

*GATE: Debe pasar antes de Phase 0. Re-evaluado tras Phase 1 (ver final).*

Esta feature es **UI Angular pura**, justo el dominio que gobierna la
Constitución (I–IV). Se evalúa contra cada principio:

**I. Estado y Datos — Separación Síncrono/Asíncrono** — ✅ CUMPLE
- **Sin `axios`**: el `AdminApiService` envuelve `HttpClient` (ARCHITECTURE §3).
- **TanStack Query = único estado de servidor**: listar/crear/guardar/publicar/
  activar-desactivar son `queryOptions`/`injectMutation` en `admin-queries.ts`,
  con invalidación (`['admin','partners']`). El borrador en edición es estado
  **síncrono** local (signals), no server-state — no va a TanStack Query hasta
  guardar.
- **NgRx SignalStore solo síncrono**: no se persisten datos de API en un store;
  si algún estado síncrono debe compartirse (no requerido v1) sería un store, no
  cache de servidor.
- **Componentes no inyectan `HttpClient`/`*ApiService`**: acceden vía
  `injectQuery`/`injectMutation`.

**II. Componentes Standalone y OnPush** — ✅ CUMPLE
- Todos los componentes standalone (sin `standalone: true` explícito), `OnPush`,
  `input()`/`output()`, `computed()`. **Reactive Forms** en alta y editor. Sin
  `ngClass`/`ngStyle` (bindings `class`/`style`), sin `@HostBinding`/`@HostListener`
  (objeto `host`). Nuevos tratamientos visuales de átomos existentes → **variante
  vía `input()`**, nunca clases Tailwind ad-hoc en su template (ARCHITECTURE §5).

**III. Inyección de Dependencias** — ✅ CUMPLE
- `inject()` en todos los servicios/componentes; `AdminApiService`/`AdminQueries`
  `providedIn: 'root'`. Sin inyección por constructor.

**IV. Estilos y Zoneless** — ✅ CUMPLE
- Tailwind v4 único sistema de estilos; el chrome del panel se compone con
  utilidades + átomos `ui/`. El preview aplica CSS custom properties `--brand-*`
  al host de su contenedor (variables, no una librería CSS nueva). Zoneless: el
  preview se actualiza por signals + `OnPush`, sin `NgZone` ni `zone.js`.

**Decisiones nuevas que la Constitución no cubre explícitamente** (detalladas en
`research.md`, ninguna en conflicto con I–IV):
1. **Aplicador de tokens con scope para el preview** (D1): reusa `toCssVars`
   (`003`) pero escribe al host del `theme-preview`, no a `:root`. Es la
   materialización de FR-011/SC-009; no introduce librería ni patrón nuevo.
2. **Cálculo de contraste WCAG en-house** (D2): aritmética de luminancia, sin
   dependencia npm; alimenta la advertencia AA (FR-008) sin bloquear edición.
3. **Diseño del chrome del panel desde cero** (D3): design language neutro sobre
   átomos `ui/`; Figma "Portal Médicos" solo como guía de estilo, no copiado.
4. **Picker de color nativo** (D4): `<input type="color">` + hex, envuelto en el
   átomo `color-field` (variante), evitando una librería de color.

**Resultado del gate**: **PASA** sin violaciones. **Complexity Tracking** vacía.

## Project Structure

### Documentation (this feature)

```text
specs/005-back-office-partners/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Phase 0 — decisiones D1..D8 y alternativas
├── data-model.md        # Phase 1 — DTOs de admin, estado de edición, contraste
├── quickstart.md        # Phase 1 — validación ejecutable (specs + flujo manual)
├── contracts/           # Phase 1
│   ├── admin-api.contract.md          # AdminApiService ↔ /api/admin/* (FR-001..006, 013..017)
│   ├── preview-isolation.contract.md  # scope aislado del preview (FR-010..012, SC-009)
│   ├── brand-editor-form.contract.md  # forma reactiva del editor + validaciones (FR-007..009)
│   ├── admin-ui-contract.md           # rutas, guard de rol, navegación, estados (FR-003, edge cases)
│   └── admin-design-language.contract.md # tokens del chrome (BNP Paribas Cardif, del Figma)
├── checklists/
│   └── (existente)      # calidad de la spec
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Front en `src/app/features/admin/` (nuevo, hoy solo un placeholder). Reutiliza
`core/theme` (`003`), átomos `theming/components` (`003`) y contratos
`shared/partner` (`002`). Monta la ruta lazy en `app.routes.ts`. Sin cambios en
`src/server/`.

```text
src/
  app/
    app.routes.ts                                 # + ruta lazy 'admin' con guards, reemplaza placeholder   [editar]
    features/
      admin/
        admin.routes.ts                           # lazy; authGuard → roleGuard('admin') (FR-003)
        layouts/
          admin-layout.ts                         # shell: nav lateral + <router-outlet>
        pages/
          partners-list/partners-list.ts          # listado + buscador (US1, FR-001/002)
          partner-create/partner-create.ts        # alta (US2, FR-004/005/006)
          partner-edit/partner-edit.ts            # editor + preview (US3/US4, FR-007..014)
        components/
          brand-editor/brand-editor.ts            # Reactive Form de tokens/assets/legal (FR-007)
          theme-preview/theme-preview.ts          # lienzo de preview en vivo, aislado (FR-010..012)
          color-field/color-field.ts              # picker+hex con advertencia de contraste (FR-008)
          asset-uploader/asset-uploader.ts        # upload → /api/admin/assets (FR-009)
        models/
          partner-admin-model.ts                  # DTOs admin (PartnerListItem, ThemeDraft…) — referencian 002
        queries/
          admin-queries.ts                        # queryOptions/mutations → AdminApiService (Const. I)
        services/
          admin-api.ts                            # AdminApiService: envuelve HttpClient → /api/admin/*
        util/
          contrast-ratio.ts                       # cálculo WCAG AA (FR-008)
          scoped-theme.ts                         # aplica --brand-* a un host, no a :root (FR-011)
    core/theme/theme-css-vars.ts                  # (de 003) toCssVars — REUSADO por scoped-theme   [sin cambios]
    features/theming/components/                  # (de 003) brand-logo, brand-footer — REUSADOS en el preview
  styles.css                                      # + @theme con tokens --color-admin-* (BNP, del Figma)   [editar]
  shared/partner/ …                               # (de 002) PartnerTheme/PublicTheme/ThemeTokens — contratos editados
```

Notas de estructura:
- **`admin-layout.ts`** es el único shell visual del feature (nav lateral +
  outlet); cada página se carga con `loadComponent` (chunk propio, ARCHITECTURE §4).
- **`scoped-theme.ts`** es el corazón del aislamiento: envuelve `toCssVars`
  (`003`) y las escribe como propiedades inline en el host del `theme-preview`,
  garantizando que el `:root` del panel nunca cambie (FR-011, SC-009).
- **`theme-preview.ts`** importa los **mismos átomos** que la experiencia real
  (`brand-logo`, `brand-footer` de `theming/components`, botones/cards de `ui/`)
  para que preview y producción no divergan (riesgo PRD 05 §10).
- El **placeholder** actual (`features/admin/admin-placeholder.ts`) se elimina al
  cablear las rutas reales.

**Structure Decision**: Feature-first Angular lazy con layout propio, siguiendo
`ARCHITECTURE.md` §1/§4/§5 al pie de la letra. El estado de servidor pasa
exclusivamente por TanStack Query (`admin-queries.ts` → `AdminApiService` →
`HttpClient`); el estado de edición es síncrono (signals locales). El preview
reutiliza el motor de tokens de `003` en un **scope aislado** y los mismos átomos
de la experiencia real. **Cero dependencias npm nuevas** y **cero cambios en el
runtime servidor** (`/api/admin/*` ya existe en `004`).

## Complexity Tracking

> Sin violaciones de la Constitución. La feature es UI Angular idiomática que
> reutiliza motores existentes (theming de `003`, contratos de `002`, endpoints
> de `004`). Tabla intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Check (tras Phase 1)

Re-evaluado con `data-model.md` y `contracts/` ya definidos:

- **I** — ✅ Confirmado: `contracts/admin-api.contract.md` define todas las
  mutaciones como `injectMutation` con invalidación; ningún componente toca
  `HttpClient`. El borrador (`data-model.md` → `ThemeDraft`) es estado síncrono
  local, fuera de TanStack Query hasta guardar.
- **II** — ✅ Confirmado: `contracts/brand-editor-form.contract.md` usa Reactive
  Forms; `contracts/admin-ui-contract.md` compone átomos `ui/` con variantes, sin
  clases ad-hoc. Todos `OnPush`/standalone.
- **III** — ✅ Confirmado: servicios `providedIn: 'root'`, `inject()` en todo.
- **IV** — ✅ Confirmado: `contracts/preview-isolation.contract.md` aplica CSS
  custom properties a un host aislado (no `:root`), reafirmando SC-009; solo
  Tailwind + variables, zoneless por signals.
  `contracts/admin-design-language.contract.md` declara los tokens del chrome
  (BNP Paribas Cardif, del Figma) en el `@theme` de Tailwind v4 y los consume solo
  como utilidades — sin librería CSS/componentes nueva; separados de los
  `--brand-*` del preview.

**Resultado**: **PASA**. Sin nuevas violaciones introducidas por el diseño. Listo
para `/speckit-tasks`.
