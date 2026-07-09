# Implementation Plan: Theming Dinámico y Anti-FOUC

**Branch**: `003-theming-dinamico-anti-fouc` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-theming-dinamico-anti-fouc/spec.md`

## Summary

Esta feature define **cómo el front aplica dinámicamente el branding de un
partner** (colores, logo, favicon, título, footer co-branded, textos legales,
tipografía) a partir de la proyección pública `PublicTheme` (feature `002`) y del
`partnerSlug` resuelto por el ruteo de tenant (feature `001`), con el criterio
duro del producto: **FOUC = 0**.

Enfoque técnico (fijado por PRD 00/03 y la Constitución):
1. **Anti-FOUC vía Angular SSR**: el servidor resuelve el theme **antes** de
   pintar e inyecta la marca inline en el primer HTML (CSS vars en `:root`,
   favicon, title, preload de fuente). Wiring nuevo (`@angular/ssr`) — hoy el
   proyecto es CSR puro.
2. **`TransferState`**: el theme resuelto viaja al cliente; la hidratación usa el
   **mismo** theme, **sin** re-fetch ni recálculo (FOUC = 0).
3. **Tokens → CSS custom properties** consumidas por Tailwind v4 (`@theme`):
   cambiar de partner = cambiar valores de variables, no tocar componentes.
4. **`ThemeStore`** (NgRx Signals, síncrono) para el theme *activo* de UI +
   **TanStack Query** (estado de servidor) keyeada por `version` para la caché y
   la navegación sin re-fetch. Un `effect` zoneless escribe `:root` + metadatos.
5. **Validación** con **Playwright CLI** (auditoría visual SSR vs hidratación),
   herramienta del agente — la suite de CI sigue siendo Karma + Jasmine.

Alcance = **aplicación y no-parpadeo del branding en el front + wiring SSR**.
Quedan **fuera** (features posteriores): el transporte HTTP/BFF y su caché
edge/`Cache-Control` (PRD 04) y la edición/publicación en Back Office (PRD 05).
El resolver SSR obtiene el theme **in-process** desde la persistencia de `002`
mientras el BFF no exista (ver `research.md` D3).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Angular 20.3. Runtime de servidor
Node 22.20 (SSR / futuro BFF).

**Primary Dependencies**:
- **Nuevo en esta feature**: `@angular/ssr` + `@angular/ssr/node`
  (`provideServerRendering`/`withRoutes`, `AngularNodeAppEngine`,
  `createNodeRequestHandler`) y `express` (server host), traídos por
  `ng add @angular/ssr`. `provideClientHydration(withEventReplay())` y
  `TransferState`/`makeStateKey` (`@angular/core`).
- **Ya presente (sin instalar)**: Angular Router, `@ngrx/signals`,
  `@tanstack/angular-query-experimental`, `HttpClient` (ya cableado en
  `app.config.ts`), Tailwind v4 (`@tailwindcss/postcss`).
- **Consumido de otras features**: `PublicTheme`/`toPublicTheme`/
  `getDefaultPublicTheme` (`002`, `src/shared/partner/` y `src/server/theme/`),
  `PartnerRepository` (`002`, `src/server/persistence/`), `TenantResolution`/
  `TenantStore`/`resolveTenant` (`001`, `src/app/core/tenant/`).

**Storage**: N/A propio. El theme se **lee** vía la persistencia de `002`
(SQLite tras el puerto `PartnerRepository`) durante el SSR, in-process. Esta
feature no crea tablas ni migra datos.

**Testing**:
- **Front (suite del proyecto)**: **Karma + Jasmine**, `*.spec.ts` junto al
  fuente (`ARCHITECTURE §9`): `toCssVars`, `ThemeStore`, `theme-applier` (con
  `DOCUMENT` mockeado), `resolve-active-theme`.
- **Server**: `node:test` (`npm run test:server`) para el resolver server-side
  que consume el repositorio de `002`.
- **E2E / visual anti-FOUC**: **Playwright CLI** como herramienta de
  verificación del agente (auditoría visual SSR vs hidratación, dos marcas +
  fallback) — **no** framework de CI (`ARCHITECTURE §9`, `TOOLS.md`, `research.md`
  D11). Escenarios en `contracts/fouc-visual-audit.contract.md` y `quickstart.md`.

**Target Platform**: Web (navegador) con **SSR** en Node 22.20. El código de
theming corre en ambos entornos (SSR-safe vía `DOCUMENT` inyectado, sin `window`
global).

**Project Type**: Aplicación web Angular de proyecto único, ahora **con SSR**
(render server-side + hidratación). El resolver de theme reutiliza la capa
server-side de `002` (`src/server/`).

**Performance Goals**: Primer paint ya con marca (**FOUC = 0**, SC-001/002).
Navegación entre pasos con **cero** requests de branding (cache hit, SC-003).
Aplicación del theme O(número de tokens) — decenas de variables CSS.

**Constraints**:
- **FOUC = 0** (criterio duro, SC-001/002): la marca se resuelve **antes** de
  pintar; primer paint == interactivo.
- **Cero marca hardcodeada** en componentes (FR-003, SC-008): todo vía
  `--brand-*` + utilidades Tailwind.
- **Zoneless** (Constitución IV): aplicación del theme por signals + `effect`,
  sin `NgZone` ni detección implícita.
- **Separación estado** (Constitución I): `ThemeStore` = síncrono activo;
  TanStack Query = caché de servidor. El componente nunca inyecta `HttpClient`.
- **Fallback indistinguible** (FR-016, SC-006): mismo theme default para todo
  motivo, sin revelar existencia de partners.
- **SSR-safe**: mismo applier corre en servidor y cliente (idempotente).

**Scale/Scope**: ≥ 2 marcas de validación (Banco Popular verde / Banco Occidente
azul) + 1 fallback. ~1 store, 1 función pura (`toCssVars`), 1 applier (`effect`),
1 resolver server-side, 1 query/api de theme, wiring SSR (3 archivos + angular.json),
componentes de superficie de marca (footer co-branded, logo/co-brand) según
necesidad de las páginas del journey.

## Constitution Check

*GATE: Debe pasar antes de Phase 0. Re-evaluado tras Phase 1 (ver final).*

**I. Estado y Datos — Separación Síncrono/Asíncrono** — ✅ CUMPLE
- `ThemeStore` (`core/store/theme.store.ts`) modela **solo** estado síncrono de
  UI (theme activo) — **no** cachea datos de API (FR-005). La caché del theme es
  **TanStack Query** (`['theme', slug, version]`), único mecanismo de estado de
  servidor, sembrada por `TransferState`. Ningún componente inyecta `HttpClient`
  ni `*ApiService`: acceden vía `injectQuery` sobre `ThemeQueries`, o al
  `ThemeStore` para el activo. **Sin axios** (el resolver SSR usa el puerto de
  `002`, no HTTP). Disciplina de capas intacta.

**II. Componentes Standalone y OnPush** — ✅ CUMPLE
- Los componentes nuevos de superficie de marca (footer co-branded, logo/co-brand,
  átomos afectados) son **standalone** + `ChangeDetectionStrategy.OnPush`, sin
  `standalone:true` explícito. Nuevos tratamientos visuales se resuelven con
  **variantes** vía `input()` (ARCHITECTURE §5), **nunca** parcheando clases ni
  embebiendo marca (FR-003). `NgOptimizedImage` para logos estáticos.

**III. Inyección de Dependencias** — ✅ CUMPLE
- Todo con `inject()` (`DOCUMENT`, `Title`, `Meta`, `TransferState`, `ThemeStore`,
  `QueryClient`); servicios singleton `providedIn: 'root'`. Sin inyección por
  constructor.

**IV. Estilos y Zoneless** — ✅ CUMPLE
- La marca se aplica como **CSS custom properties** consumidas por **Tailwind v4**
  (`@theme`), única librería de estilos — sin otra CSS ni hex hardcodeado
  (SC-008). **Zoneless**: el theme se aplica vía signals + un `effect` explícito
  (`theme-applier`), sin `zone.js` ni `NgZone`. SSR/hidratación es compatible con
  `provideZonelessChangeDetection()`.

**Decisiones nuevas que la Constitución no cubre explícitamente** (en
`research.md`, ninguna en conflicto con I–IV):
1. **Introducir Angular SSR** (`@angular/ssr`). Requerido por el anti-FOUC y
   **ya fijado** por PRD 00 (decisión 2) y las *Assumptions* del spec. Es
   plataforma Angular (no una librería de terceros de estado/estilo), compatible
   con zoneless. No es una violación: la Constitución no prohíbe SSR y su
   principio de estilos/estado se mantiene.
2. **Resolver theme in-process desde la persistencia de `002` en SSR** (D3),
   mientras el BFF (PRD 04) no exista. No introduce HTTP de cliente ni axios;
   respeta el puerto `PartnerRepository`.
3. **Playwright CLI para auditoría visual** (D11): herramienta del agente, no
   suite de CI — explícitamente permitido por `TOOLS.md`/`ARCHITECTURE §9`. No
   añade dependencia de testing al proyecto.

**Resultado del gate**: **PASA** sin violaciones. La tabla **Complexity Tracking**
queda vacía: SSR es un requisito del producto (anti-FOUC), no complejidad
injustificada.

## Project Structure

### Documentation (this feature)

```text
specs/003-theming-dinamico-anti-fouc/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Phase 0 — decisiones D1..D11 y alternativas
├── data-model.md        # Phase 1 — estado de UI, transferencia, derivados
├── quickstart.md        # Phase 1 — validación ejecutable (unit + SSR + Playwright)
├── contracts/           # Phase 1
│   ├── css-variables.contract.md      # tokens → --brand-* + @theme (FR-002/003/008)
│   ├── theme-transfer.contract.md     # resolver SSR + TransferState + caché/versión (FR-006/007/010-014)
│   ├── page-metadata.contract.md      # applier: :root + favicon + title + font (FR-004/008/017)
│   └── fouc-visual-audit.contract.md  # escenarios Playwright CLI (SC-001..007)
├── checklists/
│   └── requirements.md  # Ya existente (calidad de la spec)
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Front en `src/app/` (Angular). El theme activo es transversal ⇒ store en
`core/store/`; la lógica de aplicación (pura + effect) en `core/theme/`; la caché
de servidor (query/api) en un feature `theming/`. El wiring SSR en la raíz de
`src/`. Naming sin sufijo de tipo (ARCHITECTURE §1; excepción `.store.ts`).

```text
src/
  main.server.ts                         # bootstrap SSR (provideServerRendering + withRoutes)   [SSR, nuevo]
  server.ts                              # host Node (@angular/ssr/node: AngularNodeAppEngine)   [SSR, nuevo]
  app/
    app.config.ts                        # + provideClientHydration(withEventReplay())           [editar]
    app.config.server.ts                 # config server-side (merge con appConfig)              [SSR, nuevo]
    app.routes.server.ts                 # serverRoutes (render bajo demanda)                     [SSR, nuevo]
    app.ts                               # instancia el theme-applier (effect raíz)               [editar]
    core/
      store/
        theme.store.ts                   # ThemeStore: theme activo (síncrono) — apply/reset/cssVars (FR-005)
        theme.store.spec.ts
      theme/
        theme-css-vars.ts                # toCssVars(PublicTheme|null): Record<string,string> (pura)
        theme-css-vars.spec.ts
        theme-applier.ts                 # effect: :root + favicon + title + font preload (zoneless)
        theme-applier.spec.ts
        resolve-active-theme.ts          # TenantResolution → PublicTheme (partner | default)
        resolve-active-theme.spec.ts
        theme-transfer.ts                # THEME_STATE_KEY + init SSR/cliente (TransferState)
    features/
      theming/
        services/
          theme-api.ts                   # ThemeApiService.getTheme(slug): PublicTheme (transporte real: PRD 04)
        queries/
          theme-queries.ts               # queryOptions ['theme',slug,version] + initialData (caché, FR-010/013)
        components/
          brand-footer/brand-footer.ts   # footer co-branded + legales (standalone, OnPush) (FR-001, US2)
          brand-logo/brand-logo.ts       # logo/co-brand desde assets (NgOptimizedImage) (FR-001, FR-017)
  styles.css                             # @theme mapea --color-*/--font-brand a var(--brand-*)   [editar]
  server/
    theme/ …                             # (de 002) default-theme.ts, reutilizado por el resolver SSR
    persistence/ …                       # (de 002) PartnerRepository — consumido in-process en SSR
```

Notas de estructura:
- **`src/server/` (de `002`)** se **reutiliza** desde el resolver SSR
  (`resolve-active-theme` en su ruta server-side) para leer el theme in-process;
  no se duplica lógica de persistencia.
- **`TenantStore`/`resolveTenant` (de `001`)** proveen la `TenantResolution`; el
  resolver de theme la consume, no la recalcula.
- El wiring `PERSISTENCE_DRIVER`/BFF real (PRD 04) se conecta después; aquí el
  resolver server-side invoca la factory ya entregada por `002`
  (`persistence-config.ts`).
- Los componentes de marca (`brand-footer`, `brand-logo`) se crean **solo** si las
  páginas del journey los requieren; si ya existen átomos en `shared/components/ui`
  se extienden con **variantes** (ARCHITECTURE §5), no con clases ad-hoc.

**Structure Decision**: Proyecto único Angular **con SSR**. El estado del theme
activo es transversal (`core/store/theme.store.ts`); la aplicación al DOM
(pura + `effect`) vive en `core/theme/`; la caché de servidor en un feature
`theming/` (query + api). El anti-FOUC se implementa con el wiring SSR en la raíz
(`main.server.ts`, `server.ts`, `app.config.server.ts`, `app.routes.server.ts`) +
`TransferState`, reutilizando la persistencia server-side de `002` para resolver
el theme sin BFF (frontera con PRD 04 documentada en `research.md` D3).

## Complexity Tracking

> Sin violaciones de la Constitución. El **wiring SSR** no es complejidad
> injustificada: es el mecanismo **requerido** por el criterio duro del producto
> (FOUC = 0) y una decisión ya fijada por PRD 00/03. Tabla intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Check (tras Phase 1)

Re-evaluado con `data-model.md` y `contracts/` ya definidos:

- **I** — ✅ Confirmado: `contracts/theme-transfer.contract.md` mantiene la caché
  en TanStack Query (keyeada por versión) y el theme activo en `ThemeStore`
  síncrono; ningún componente toca `HttpClient`.
- **II** — ✅ Confirmado: componentes de marca standalone + OnPush con variantes
  vía `input()`; `contracts/css-variables.contract.md` prohíbe hex hardcodeado.
- **III** — ✅ Confirmado: `inject()` en applier/transfer/queries; servicios
  `providedIn: 'root'`.
- **IV** — ✅ Confirmado: `contracts/css-variables.contract.md` usa Tailwind
  `@theme` + `--brand-*`; `contracts/page-metadata.contract.md` aplica vía
  `effect` zoneless con `DOCUMENT` inyectado.

**Resultado**: **PASA**. Sin nuevas violaciones introducidas por el diseño. Listo
para `/speckit-tasks`.
