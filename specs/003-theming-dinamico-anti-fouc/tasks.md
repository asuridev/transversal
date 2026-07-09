---
description: "Task list for Theming Dinámico y Anti-FOUC"
---

# Tasks: Theming Dinámico y Anti-FOUC

**Input**: Design documents from `/specs/003-theming-dinamico-anti-fouc/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The plan (§Testing) y `quickstart.md` §1–§2 nombran explícitamente
la suite de unit tests (Karma + Jasmine, `*.spec.ts`) y server tests (`node:test`,
`*.test.ts`) como parte del entregable. La auditoría visual Playwright CLI es
herramienta de verificación del agente (D11), no framework de CI.

**Organization**: Tareas agrupadas por historia de usuario para implementación y
prueba independiente. Prioridades del spec: US1/US2/US3 = P1, US4/US5 = P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivo distinto, sin dependencia con tareas incompletas)
- **[Story]**: US1..US5 (solo en fases de historia)
- Rutas de archivo exactas incluidas en cada tarea

## Path Conventions

Proyecto único Angular **con SSR** (plan §Project Structure). Front en `src/app/`,
capa server-side reutilizada de `002` en `src/server/`, wiring SSR en la raíz de `src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Cablear la plataforma SSR (hoy el proyecto es CSR puro) — prerequisito de la resolución antes de pintar.

- [X] T001 Ejecutar `ng add @angular/ssr` para instalar `@angular/ssr` + `express` y generar el scaffold SSR: `src/main.server.ts` (`bootstrapApplication` + `provideServerRendering(withRoutes(serverRoutes))`), `src/server.ts` (`AngularNodeAppEngine` + `createNodeRequestHandler`), `src/app/app.config.server.ts`, `src/app/app.routes.server.ts`, opciones `server`/`ssr`/`outputMode: "server"` en `angular.json`, y el script `serve:ssr` en `package.json`
- [X] T002 Añadir `provideClientHydration(withEventReplay())` a `src/app/app.config.ts` (habilita hidratación con replay de eventos, base del anti-FOUC)
- [X] T003 Smoke: `npm run build` + `npm run serve:ssr` arrancan y sirven HTML SSR en `http://localhost:4000` sin errores (verificación manual del wiring)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Motor de theming compartido por TODAS las historias (tokens→CSS vars, store síncrono, applier zoneless, transferencia). Sin esto ninguna historia puede aplicar branding.

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta completar esta fase.

- [X] T004 Declarar el bloque `@theme` (mapea `--color-*`/`--font-brand` → `var(--brand-*)`) y los neutros de arranque `:root { --brand-* }` en `src/styles.css`, según `contracts/css-variables.contract.md` (Tailwind v4, cero hex en componentes)
- [X] T005 [P] Escribir spec (primero, debe fallar) de `toCssVars`: 9 claves `--brand-*`, Popular vs Occidente mismas claves/valores distintos, `null → {}`, token aditivo `accentHover → --brand-accent-hover`, valores verbatim, en `src/app/core/theme/theme-css-vars.spec.ts`
- [X] T006 Implementar la función pura `toCssVars(theme: PublicTheme | null): Record<string,string>` en `src/app/core/theme/theme-css-vars.ts` según el mapa normativo de `contracts/css-variables.contract.md`
- [X] T007 [P] Escribir spec (primero, debe fallar) de `ThemeStore`: `apply`/`reset`, computed `isBranded`, computed `cssVars` derivado de `toCssVars`, en `src/app/core/store/theme.store.spec.ts`
- [X] T008 Implementar `ThemeStore` (NgRx SignalStore, `providedIn:'root'`) con `withState({ theme })`, `withComputed({ isBranded, cssVars })`, `withMethods({ apply, reset })` en `src/app/core/store/theme.store.ts` (data-model §2; no cachea datos de API — Constitución I)
- [X] T009 Definir `THEME_STATE_KEY = makeStateKey<PublicTheme>('theme')` y los helpers de init SSR/cliente de `TransferState` en `src/app/core/theme/theme-transfer.ts` (data-model §5, `contracts/theme-transfer.contract.md` §2)
- [X] T010 [P] Escribir spec (primero, debe fallar) del applier con `DOCUMENT` mockeado: escribe `--brand-*`, favicon, `document.title`, preload de fuente; idempotencia (no duplica `<link>`); `faviconUrl` inválido no lanza ni borra CSS vars, en `src/app/core/theme/theme-applier.spec.ts`
- [X] T011 Implementar `theme-applier` (servicio raíz con un `effect` zoneless que reacciona a `ThemeStore.cssVars()`/`theme()` y escribe `:root` + `<link rel="icon">` + `title` + `<link rel="preload" as="font">`) usando `inject(DOCUMENT)`/`inject(Title)`/`inject(Meta)` en `src/app/core/theme/theme-applier.ts` (`contracts/page-metadata.contract.md`, research D6/D7)
- [X] T012 Instanciar el `theme-applier` (crear el `effect` raíz) desde `src/app/app.ts` para que la aplicación al DOM esté viva durante toda la sesión

**Checkpoint**: Motor de theming listo — las historias de usuario pueden comenzar.

---

## Phase 3: User Story 1 - Primer paint ya con la marca del partner (sin FOUC) (Priority: P1) 🎯 MVP

**Goal**: El servidor resuelve el theme del partner ANTES de pintar e inyecta la marca inline en el primer HTML; el cliente hidrata con el MISMO theme vía `TransferState`, sin re-fetch (FOUC = 0).

**Independent Test**: Cargar la URL de un partner con branding publicado contra el server SSR y verificar por auditoría visual que el primer render == experiencia interactiva (sin cambio de colores/logo/favicon/título).

### Tests for User Story 1 ⚠️

- [X] T013 [P] [US1] Escribir server test (`node:test`, primero, debe fallar) de `resolveActiveTheme`: `kind:'partner'` con theme publicado → ese `PublicTheme`; sin theme publicado → default; round-trip serializable, en `src/app/core/theme/resolve-active-theme.server.test.ts` (`contracts/theme-transfer.contract.md` §5)

### Implementation for User Story 1

- [X] T014 [P] [US1] Verificar/añadir fixtures de branding para el resolver SSR in-process: **Banco Popular** (verde), **Banco Occidente** (azul) y `__default__`, en `src/server/persistence/__fixtures__/brands.ts` (quickstart §Prerrequisitos)
- [X] T015 [US1] Implementar el resolver server-side `resolveActiveTheme(resolution: TenantResolution): Promise<PublicTheme>` que consume `PartnerRepository.getPublishedTheme(slug)` (feature `002`, in-process) y cae a `getDefaultPublicTheme()` en fallback, en `src/app/core/theme/resolve-active-theme.server.ts` (research D3, `contracts/theme-transfer.contract.md` §1)
- [X] T016 [US1] En el bootstrap server-side (`src/app/app.config.server.ts` + `src/main.server.ts`), resolver el theme desde la `TenantResolution`, escribir `transferState.set(THEME_STATE_KEY, theme)`, sembrar `ThemeStore.apply(theme)` y emitir la marca **inline** en el HTML SSR (CSS vars en `:root` + favicon + title + preload de fuente) para que el primer paint traiga la marca (FR-006)
- [X] T017 [US1] En el bootstrap cliente (`src/app/app.config.ts` vía helper de `theme-transfer.ts`), leer `transferState.get(THEME_STATE_KEY, null)` y sembrar `ThemeStore.apply(theme)` sin re-resolver ni re-pedir (FR-007, FR-014); garantizar idempotencia con el HTML SSR (sin parpadeo en hidratación)
- [X] T018 [US1] Auditoría visual Playwright CLI escenarios A/E/F de `contracts/fouc-visual-audit.contract.md`: FOUC=0 en primer paint de Popular (primer render == interactivo), favicon/`<title>` del partner, fuente custom sin bloqueo (`preload`+`swap`). Evidencia: screenshots antes/después de hidratar + logs de red

**Checkpoint**: US1 funcional — un partner se pinta con su marca desde el primer paint sin FOUC. MVP entregable.

---

## Phase 4: User Story 2 - Toda la experiencia refleja el branding del partner (Priority: P1)

**Goal**: Todos los elementos de identidad (paleta, ambos logos, favicon, título, footer co-branded, legales) reflejan la marca del partner activo vía valores centralizados, sin marca embebida por componente.

**Independent Test**: Recorrer la experiencia de un partner y verificar que cada elemento de identidad corresponde exactamente al theme publicado, sin valores por defecto ni mezcla entre partners.

### Implementation for User Story 2

- [X] T019 [P] [US2] Crear componente `brand-logo` (standalone, OnPush) que renderiza logo de producto + co-brand del banco desde `assets` con `NgOptimizedImage`, ocultando el `<img>` roto sin romper layout (FR-017), en `src/app/features/theming/components/brand-logo/brand-logo.ts`
- [X] T020 [P] [US2] Crear componente `brand-footer` (standalone, OnPush) con footer co-branded + disclaimer/enlaces legales desde `legal` del theme activo (vía `ThemeStore`), en `src/app/features/theming/components/brand-footer/brand-footer.ts`
- [X] T021 [US2] Aplicar utilidades Tailwind de marca (`bg-primary`, `text-text-strong`, `border-border`, `font-brand`, …) en las superficies del journey (p. ej. `src/app/features/partner-shell/partner-shell.ts` y páginas), eliminando cualquier color/asset de marca hardcodeado (FR-003, SC-008)
- [X] T022 [US2] Auditoría visual Playwright CLI escenario B de `contracts/fouc-visual-audit.contract.md`: Popular (verde) vs Occidente (azul) renderizados con el 100% de su propia marca, sin mezcla de valores (SC-004)

**Checkpoint**: US1 + US2 funcionan — la marca es completa y coherente en toda la superficie visible.

---

## Phase 5: User Story 3 - Navegación dentro del journey sin volver a pedir el branding (Priority: P1)

**Goal**: Tras la primera resolución, avanzar entre pasos del journey del mismo partner no origina nuevas solicitudes de branding (cache hit por `['theme', slug, version]`, sembrado por `TransferState`).

**Independent Test**: Cargar un partner, navegar entre varios pasos y verificar que no se disparan nuevas requests de branding para ese partner.

### Implementation for User Story 3

- [X] T023 [P] [US3] Crear `ThemeApiService` con la firma final `getTheme(slug: string): PublicTheme` (`providedIn:'root'`; transporte HTTP real diferido a PRD 04, stub por ahora) en `src/app/features/theming/services/theme-api.ts` (`contracts/theme-transfer.contract.md` §4)
- [X] T024 [US3] Crear `ThemeQueries` con `queryOptions({ queryKey: ['theme', slug, version], queryFn, initialData, staleTime: 5*60_000, gcTime: 30*60_000 })`, sembrando `initialData` desde `TransferState` en `src/app/features/theming/queries/theme-queries.ts` (data-model §4, `contracts/theme-transfer.contract.md` §3)
- [X] T025 [US3] Consumir la query vía `injectQuery` en el shell del partner (`src/app/features/partner-shell/partner-shell.ts`) para que la navegación entre pasos reutilice la caché sin re-fetch; ningún componente inyecta `HttpClient` (Constitución I)
- [X] T026 [US3] Auditoría visual Playwright CLI escenario C de `contracts/fouc-visual-audit.contract.md`: navegar oferta→formulario→confirmación con **cero** nuevas requests de branding (SC-003), evidenciado en logs de red

**Checkpoint**: US1 + US2 + US3 — journey completo con marca estable y sin re-fetch entre pasos.

---

## Phase 6: User Story 4 - Un cambio publicado se refleja sin redeploy (Priority: P2)

**Goal**: Dejar el contrato de caché keyeada por `version` (cache-busting natural): al publicar (version++), la próxima visita resuelve el nuevo theme sin redeploy. La invalidación real y `Cache-Control`/CDN son PRD 04/05.

**Independent Test**: Con dos versiones del mismo `slug`, verificar que `version++` produce una `queryKey` distinta y que la nueva versión no queda servida con datos de la anterior.

### Implementation for User Story 4

- [X] T027 [US4] Añadir spec de `ThemeQueries` verificando que `['theme', slug, version]` cambia con `version` (cache-busting) y que `version` vieja no se reutiliza, en `src/app/features/theming/queries/theme-queries.spec.ts` (FR-013, SC-005)
- [X] T028 [US4] Documentar la frontera de invalidación (key por versión; `invalidateQueries(['theme', slug])` y `Cache-Control`/CDN diferidos a PRD 04/05) como nota en `src/app/features/theming/queries/theme-queries.ts` y confirmar coherencia con `contracts/theme-transfer.contract.md` §4

**Checkpoint**: El branding no queda "congelado": una versión nueva es una clave nueva.

---

## Phase 7: User Story 5 - Fallback a theme por defecto sin parpadeo (Priority: P2)

**Goal**: Ante `slug` no servible (inexistente, inactivo, raíz), el primer paint trae el theme default neutro, indistinguible entre motivos y sin flash.

**Independent Test**: Cargar una URL con `slug` no servible y verificar que el primer paint ya trae el default neutro, sin reajuste posterior e indistinguible entre motivos de fallback.

### Implementation for User Story 5

- [X] T029 [US5] Añadir specs de fallback indistinguible: `resolve-active-theme` con `kind:'fallback' | 'root' | 'reserved'` → el MISMO `getDefaultPublicTheme()` (server test), y `ThemeStore.reset()` → default en runtime (no `null`), en `src/app/core/theme/resolve-active-theme.server.test.ts` y `src/app/core/store/theme.store.spec.ts` (FR-016, SC-006)
- [X] T030 [US5] Auditoría visual Playwright CLI escenario D de `contracts/fouc-visual-audit.contract.md`: slug inexistente / inactivo / raíz → mismo theme default sin parpadeo, sin revelar existencia de partners (SC-006)

**Checkpoint**: Todas las historias funcionan independientemente; el fallback también es anti-FOUC.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verificación transversal y cierre de calidad.

- [X] T031 [P] Auditar SC-008: **cero** componentes con colores/assets de marca hardcodeados (grep de hex/`style="color"` en `src/app/**`); toda apariencia de marca proviene de `--brand-*`/utilidades Tailwind
- [X] T032 Ejecutar la validación completa de `quickstart.md`: `npm test`, `npm run test:server`, `npm run build` + `serve:ssr`, `curl` del HTML SSR (marca inline), y los escenarios A–F de Playwright
- [X] T033 [P] Actualizar la sección gestionada de contexto del agente si aplica (`/speckit-agent-context-update`) y notas de arquitectura sobre el nuevo wiring SSR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — arranca de inmediato.
- **Foundational (Phase 2)**: Depende de Setup. **BLOQUEA** todas las historias.
- **User Stories (Phase 3–7)**: Todas dependen de Foundational.
  - US1 (P1) entrega el anti-FOUC/SSR + resolver + TransferState (núcleo).
  - US2 (P1) puede correr en paralelo con US1 (componentes de marca) pero valida mejor tras US1.
  - US3 (P1) reutiliza el `TransferState` de US1 para sembrar `initialData`.
  - US5 (P2) reutiliza el resolver de US1 (rama fallback).
  - US4 (P2) reutiliza la query de US3.
- **Polish (Phase 8)**: Depende de las historias deseadas completas.

### User Story Dependencies

- **US1 (P1)**: Solo Foundational. Base del resto (resolver + transfer).
- **US2 (P1)**: Solo Foundational; independientemente testable. Se apoya en el motor foundational, no en US1.
- **US3 (P1)**: Foundational + `TransferState` de US1 (`initialData`).
- **US4 (P2)**: US3 (query de theme).
- **US5 (P2)**: US1 (resolver server-side).

### Within Each User Story

- Los tests (marcados) se escriben primero y deben FALLAR antes de implementar.
- Función pura / modelos → store → applier → wiring SSR/cliente → componentes → auditoría visual.

### Parallel Opportunities

- T005/T007/T010 (specs de unidades distintas) en paralelo dentro de Foundational.
- T013/T014 en paralelo al inicio de US1; T019/T020 en paralelo en US2; T023 en paralelo al inicio de US3.
- Con equipo: tras Foundational, US1 y US2 pueden repartirse; US3/US4/US5 encadenan sobre US1.

---

## Parallel Example: Foundational (Phase 2)

```bash
# Specs de unidades independientes juntas (escribir primero, deben fallar):
Task: "toCssVars spec en src/app/core/theme/theme-css-vars.spec.ts"
Task: "ThemeStore spec en src/app/core/store/theme.store.spec.ts"
Task: "theme-applier spec (DOCUMENT mockeado) en src/app/core/theme/theme-applier.spec.ts"
```

## Parallel Example: User Story 2

```bash
# Componentes de marca en archivos distintos, en paralelo:
Task: "brand-logo en src/app/features/theming/components/brand-logo/brand-logo.ts"
Task: "brand-footer en src/app/features/theming/components/brand-footer/brand-footer.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup (wiring SSR).
2. Phase 2: Foundational (motor de theming) — CRÍTICO, bloquea todo.
3. Phase 3: US1 (resolver + inline SSR + TransferState).
4. **STOP y VALIDAR**: auditoría visual FOUC=0 de un partner.
5. Demo del MVP.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 → FOUC=0 primer paint (MVP).
3. US2 → marca completa en toda la superficie.
4. US3 → navegación sin re-fetch.
5. US4 → cache-busting por versión.
6. US5 → fallback anti-FOUC.

---

## Notes

- [P] = archivos distintos, sin dependencias.
- Suite automatizada: Karma + Jasmine (`*.spec.ts`) y `node:test` (`*.test.ts`). Playwright CLI = verificación del agente, NO dependencia npm ni framework de CI (research D11).
- Zoneless: la aplicación al DOM es un `effect` explícito, sin `NgZone`/`zone.js`.
- Constitución I: `ThemeStore` síncrono; caché en TanStack Query; ningún componente inyecta `HttpClient`.
- Frontera con PRD 04/05 (transporte BFF, invalidación real, Back Office) fuera de alcance — documentada en `contracts/theme-transfer.contract.md` §4.
- Commit tras cada tarea o grupo lógico; parar en checkpoints para validar la historia.
