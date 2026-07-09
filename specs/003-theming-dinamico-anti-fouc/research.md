# Research — Theming Dinámico y Anti-FOUC

**Feature**: `003-theming-dinamico-anti-fouc` | **Date**: 2026-07-04

Resuelve las incógnitas técnicas del plan. Cada decisión referencia los
requisitos del `spec.md` y el PRD `03-theming-dinamico-y-anti-fouc.md`. Las
librerías y su sintaxis se verificaron contra la documentación vigente de
Angular v20 (vía `ctx7`, ver `TOOLS.md`).

---

## D1 — Anti-FOUC vía Angular SSR + hidratación

- **Decision**: Introducir **Angular SSR** (`@angular/ssr`, paquete de la
  plataforma, cero librerías de terceros). El servidor resuelve el theme del
  partner **antes** de emitir HTML, inyecta las CSS custom properties de marca
  inline en el `<head>`/`:root`, y setea `<link rel="icon">` + `<title>` +
  `preload` de la fuente en ese primer HTML. El cliente **hidrata** con
  `provideClientHydration(withEventReplay())`.
- **Rationale**: El FOUC ocurre cuando el HTML llega sin marca y el theme se
  aplica después en el cliente (parpadeo default→marca). Resolver en servidor
  es la **única** forma de que el *primer paint* ya traiga la marca (FR-006,
  SC-001). Es además una decisión **ya fijada** por PRD 00 (decisión 2) y por
  la sección *Assumptions* del spec — no se re-discute, solo se materializa.
  El proyecto hoy es CSR puro (no hay `server.ts` ni `@angular/ssr`); este es
  el wiring nuevo central de la feature.
- **API vigente (Angular 20.3)**:
  - `main.server.ts`: `bootstrapApplication(App, config, context)` con
    `provideServerRendering(withRoutes(serverRoutes))`.
  - `server.ts`: `AngularNodeAppEngine` + `createNodeRequestHandler` +
    `writeResponseToNodeResponse` de `@angular/ssr/node`.
  - `app.config.ts`: añadir `provideClientHydration(withEventReplay())`.
  - `angular.json`: opciones `server: "src/main.server.ts"`,
    `ssr: { entry: "src/server.ts" }`, `outputMode: "server"` sobre el
    builder `@angular/build:application` (lo cablea `ng add @angular/ssr`).
- **Alternatives considered**:
  - *Script inline en `index.html` que aplica CSS vars antes del bootstrap*:
    evita FOUC de colores pero **no** entrega el DOM ya pintado con la marca,
    depende de JS y no cubre logos/legales renderizados por componentes.
    Rechazado — SSR es el mandato del PRD y da el paint completo.
  - *Prerender estático*: los partners y sus themes cambian sin redeploy
    (FR-012), el set de slugs es dinámico; el prerender total no aplica.
    Se usa render bajo demanda (`outputMode: server`).

## D2 — Transferencia del theme resuelto: `TransferState` (no re-fetch en hidratación)

- **Decision**: El theme resuelto en SSR viaja al cliente por **`TransferState`**
  (`@angular/core`) bajo una `StateKey` tipada (`makeStateKey<PublicTheme>`).
  En el cliente, ese valor **siembra** tanto (a) el `ThemeStore` para el
  primer paint como (b) el `initialData` de la query TanStack `['theme', slug,
  version]`, de modo que la hidratación **no** dispara fetch ni recálculo
  (FR-007, FR-014, SC-002).
- **Rationale**: Garantiza que el branding del primer paint y el de la
  experiencia interactiva deriven de la **misma** data (FR-014). `TransferState`
  es el mecanismo idiomático de Angular SSR para esto y ya está soportado por
  la hidratación. La igualdad server/cliente elimina la clase entera de FOUC
  por "desalineación de tokens" (Riesgo del PRD §9).
- **Alternatives considered**:
  - *Re-fetch en cliente al bootstrap*: reintroduce parpadeo y latencia;
    viola FR-007. Rechazado.
  - *Serializar el theme en un `<script type="application/json">` propio*:
    duplica lo que `TransferState` ya hace de forma integrada con la
    hidratación. Rechazado por reinventar.

## D3 — Origen del theme en SSR sin BFF (frontera con PRD 04)

- **Decision**: Durante el SSR, el theme se obtiene **in-process** llamando al
  puerto `PartnerRepository` de la feature `002` (código server-side ya
  existente en `src/server/`), vía un **resolver de theme server-side** que
  toma el `slug` resuelto por el ruteo de tenant (feature `001`) y devuelve el
  `PublicTheme` (o el default en fallback). **No** se hace HTTP en el primer
  render. El endpoint HTTP del BFF (`GET /api/theme/:slug`) y su caché
  server/CDN son **PRD 04** (fuera de alcance aquí).
- **Rationale**: El spec acota explícitamente el transporte (BFF) a PRD 04,
  pero el anti-FOUC (esta feature) necesita el theme en SSR **hoy**. La
  persistencia de `002` ya expone `getPublishedTheme(slug)` y
  `getDefaultPublicTheme()` en el mismo runtime Node del SSR: llamarla directo
  es la ruta de menor acoplamiento y cero dependencia nueva. Cuando PRD 04
  aterrice, el resolver server-side cambia su origen (repo directo → cliente
  BFF cacheado) **sin** tocar el `ThemeStore`, el `effect`, ni los componentes.
- **Consecuencia acotada (documentada, no incompleta)**: el `queryFn` de la
  query TanStack de cliente apunta a un `ThemeApiService` cuyo endpoint real
  llega en PRD 04. En esta feature, `initialData` desde `TransferState`
  satisface el **primer paint** y la **navegación entre pasos** (US1/US3): la
  misma `queryKey` + `staleTime` evita cualquier fetch durante el journey. El
  refetch por red efectivo se ejercita cuando exista el BFF. Esta frontera se
  refleja en `contracts/theme-transfer.contract.md` y en `quickstart.md`.
- **Alternatives considered**:
  - *Adelantar el BFF a esta feature*: expande el alcance a PRD 04, contra el
    bounding explícito del spec. Rechazado.
  - *Mock HTTP endpoint temporal*: añade superficie desechable; `TransferState`
    ya cubre los escenarios de esta feature sin él. Rechazado.

## D4 — Tokens → CSS custom properties consumidas por Tailwind v4

- **Decision**: Los `ThemeTokens` (y `typography.fontFamily`) se proyectan a un
  mapa `{ '--brand-*': string }` mediante una función **pura** `toCssVars`
  (`src/app/core/theme/theme-css-vars.ts`). `styles.css` declara un bloque
  `@theme` que mapea `--color-*`/`--font-brand` de Tailwind a esas
  `var(--brand-*)`. Los componentes usan utilidades (`bg-primary`,
  `text-secondary`, `border-border`, `font-brand`) — **cero** hex hardcodeado
  (FR-002, FR-003, SC-008; Constitución IV).
- **Rationale**: Cambiar de partner = cambiar el valor de variables en `:root`,
  sin recompilar ni tocar componentes (FR-002). Es el mecanismo nativo de
  Tailwind v4 (`@theme` + `var()`), la única librería de estilos permitida
  (Constitución IV). `toCssVars` pura ⇒ testeable con Karma+Jasmine sin DOM.
- **Mapa de tokens** (ver `contracts/css-variables.contract.md`): las 8 claves
  de `ThemeTokens` → `--brand-primary`, `--brand-primary-tint`,
  `--brand-secondary`, `--brand-secondary-tint`, `--brand-text-strong`,
  `--brand-text-muted`, `--brand-surface`, `--brand-border`;
  `typography.fontFamily` → `--brand-font-family`. Tokens extra (aditivos,
  `[extraToken]`, FR-006 de `002`) se emiten como `--brand-<kebab>` sin romper
  consumidores.
- **Alternatives considered**:
  - *Clases Tailwind por marca / `safelist` por partner*: multiplica CSS por
    partner y mete marca en los componentes. Rechazado (viola FR-003/SC-008).
  - *Estilos inline por elemento*: prohibido usar `style` binding para marca
    transversal; no escala ni centraliza. Rechazado.

## D5 — Estado del theme activo: `ThemeStore` (síncrono) separado de la caché (TanStack Query)

- **Decision**: Dos responsabilidades separadas, coherentes con Constitución I:
  - **`ThemeStore`** (`core/store/theme.store.ts`, `providedIn: 'root'`,
    NgRx SignalStore): estado **síncrono** del theme *activo* de UI —
    `withState({ theme })`, `withComputed({ isBranded, cssVars })`,
    `withMethods({ apply, reset })`. Es la fuente desde la que un `effect`
    escribe `:root` + metadatos. Vive en `core/store/` por ser transversal sin
    feature dueño (ARCHITECTURE §2).
  - **TanStack Query** (`features/theming/queries/theme-queries.ts`): el theme
    como **estado de servidor** cacheable (`['theme', slug, version]`,
    `staleTime`/`gcTime`), sembrado por `initialData` desde `TransferState`.
- **Rationale**: La Constitución (I) prohíbe modelar datos de API en el
  SignalStore y exige TanStack Query como única capa de caché/servidor. El
  `ThemeStore` **no** cachea: solo refleja el theme activo para el render
  síncrono (FR-005). El `apply()` se invoca desde el estado inyectado por SSR
  (hidratación) y desde el `onSuccess`/`initialData` de la query.
- **Alternatives considered**:
  - *Guardar el theme solo en TanStack Query y leerlo en cada componente*:
    obliga a `injectQuery` disperso y no da un punto único síncrono para el
    `effect` de `:root`/metadatos. Rechazado.
  - *Guardar la caché en el `ThemeStore`*: viola Constitución I. Rechazado.

## D6 — Aplicación a DOM: un `effect` zoneless (CSS vars + favicon + title)

- **Decision**: Un único `effect` (creado en un servicio raíz
  `core/theme/theme-applier.ts` o en el `App` root) reacciona a
  `ThemeStore.cssVars()`/`theme()` y escribe: (a) las `--brand-*` en
  `document.documentElement.style`, (b) `<link rel="icon">` (favicon), (c)
  `document.title`, (d) el `<link rel="preload" as="font">` de la fuente. Usa
  `inject(DOCUMENT)` y `inject(Title)`/`Meta`; **sin** `NgZone`, solo signals
  + `OnPush` (Constitución IV).
- **Rationale**: Zoneless ⇒ la reacción a cambios de theme debe ser explícita
  por signals (`effect`), no por detección implícita. Centralizar la escritura
  al DOM en un solo punto evita que cada componente manipule `:root`/metadatos.
  En SSR el mismo estado ya se emitió inline en el HTML; el `effect` en cliente
  es idempotente (escribe los mismos valores) ⇒ sin parpadeo en hidratación.
- **Alternatives considered**:
  - *`@HostBinding`/`ngStyle` en el root*: prohibidos (Constitución II) y no
    cubren favicon/title. Rechazado.
  - *Manipular DOM desde el store*: el store es estado puro; los efectos de
    borde van en un `effect`/servicio. Rechazado.

## D7 — Tipografía de marca sin bloqueo ni salto (FR-008)

- **Decision**: `preload` de la fuente del partner en el `<head>` del SSR
  (`<link rel="preload" as="font" type="font/woff2" crossorigin>` cuando
  `typography.fontUrlWoff2` existe) + `font-display: swap`. La familia se aplica
  vía `--brand-font-family`; el `@font-face` (si hay `fontUrlWoff2`) se declara
  con `swap`. Si no hay fuente custom, se usa la familia declarada como nombre
  del sistema/fallback.
- **Rationale**: `swap` evita bloquear el render (FR-008); el `preload` en SSR
  reduce el salto tipográfico al mínimo perceptible. Mitiga el Riesgo "parpadeo
  por fuente custom tardía" del PRD §9.
- **Alternatives considered**: `font-display: block` (bloquea, viola FR-008);
  sin `preload` (salto mayor). Rechazados.

## D8 — Caché, versión e invalidación (frontera con PRD 04/05)

- **Decision**: La `queryKey` incluye la **versión** del theme
  (`['theme', slug, version]`, `version` de `PublicTheme`, definida en `002`),
  de modo que un branding nuevo (version++) es una **clave distinta** ⇒
  cache-busting natural (FR-013). `staleTime` 5 min / `gcTime` 30 min (valores
  estándar del PRD §6). La **invalidación** al publicar y el `Cache-Control`
  server/CDN son PRD 04/05; esta feature deja el **contrato**: keyear por
  versión y no congelar el theme (documentado en
  `contracts/theme-cache.contract.md`).
- **Rationale**: Dentro del journey (misma `slug`+`version`), TanStack Query no
  re-pide (FR-010, SC-003). Al publicar (PRD 05), cambia `version` y/o se
  invalida `['theme', slug]` ⇒ próximas visitas ven lo nuevo sin redeploy
  (FR-012, SC-005). Mantener la versión en la clave asegura que no se sirva una
  versión vieja (FR-013).
- **Alternatives considered**: keyear solo por `slug` (arriesga servir versión
  vieja tras publicar); TTL infinito (congela el theme). Rechazados.

## D9 — Fallback indistinguible sin parpadeo (FR-016, SC-006)

- **Decision**: Ante `slug` no servible (inexistente, inactivo, raíz —
  `TenantResolution.kind !== 'partner'`, feature `001`), el resolver server-side
  devuelve `getDefaultPublicTheme()` (partner `__default__`, feature `002`) y el
  SSR pinta el primer HTML con el theme default. El resultado visual es
  **idéntico** para todos los motivos de fallback y no revela si un partner
  existe.
- **Rationale**: Reusa la red de seguridad ya definida en `001`/`002`
  (`__default__`), extiende el anti-FOUC al caso default (FR-009). La
  indistinguibilidad se garantiza porque todos los motivos convergen al **mismo**
  `PublicTheme` neutro (SC-006).
- **Alternatives considered**: theme default distinto por motivo (filtra
  existencia de partners, viola SC-006). Rechazado.

## D10 — Resiliencia de assets de marca (FR-017)

- **Decision**: La ausencia/falla de un asset individual (logo, favicon, fuente)
  **no** aborta la aplicación del resto del branding. Los `<img>` de logo usan
  `NgOptimizedImage` con un fallback de error que oculta el elemento roto sin
  romper el layout; el favicon/fuente que no cargan degradan al valor previo/de
  sistema. El theme (colores, legales, title) se aplica igual.
- **Rationale**: Un binario ausente no debe provocar parpadeo del conjunto
  (FR-017, edge case del spec). La marca es un agregado de partes independientes.
- **Alternatives considered**: bloquear el render hasta que todos los assets
  carguen (reintroduce FOUC/bloqueo). Rechazado.

## D11 — Validación E2E/visual con Playwright CLI (input del usuario)

- **Decision**: La validación funcional del anti-FOUC se realiza con
  **Playwright CLI** (skill `.claude/skills/playwright-cli/`, `TOOLS.md`) como
  **herramienta de verificación del agente**: cargar la URL de un partner
  contra el server SSR, capturar el **primer render** y compararlo con la
  experiencia ya hidratada/interactiva, sobre **Banco Popular** (verde),
  **Banco Occidente** (azul) y un caso de **fallback** (SC-001..SC-007). Los
  escenarios se documentan en `quickstart.md`.
- **Rationale**: El spec (*Assumptions*, *Independent Test*) y el PRD (§8)
  piden **auditoría visual** comparando SSR vs hidratación — exactamente lo que
  la Playwright CLI habilita. Es coherente con `ARCHITECTURE §9` y `TOOLS.md`:
  Playwright CLI es verificación manual/exploratoria del agente, **no** se
  introduce como framework de pruebas del proyecto ni como dependencia npm.
- **Suite automatizada**: permanece **Karma + Jasmine** (`*.spec.ts` junto al
  fuente): unit de `toCssVars` (mapa de tokens), `ThemeStore`
  (`apply`/`reset`/`cssVars`), el `effect`/applier con `DOCUMENT` mockeado, y el
  resolver server-side de theme. Sin dependencia de Playwright en CI.
- **Alternatives considered**: adoptar Playwright como framework de tests del
  proyecto (contradice `ARCHITECTURE §9`/`TOOLS.md` y la Constitución IV de
  stack única). Rechazado — se usa solo como CLI de verificación del agente.

---

## Resumen de dependencias nuevas

| Ítem | Tipo | Nota |
|------|------|------|
| `@angular/ssr` + `@angular/ssr/node` | dependencia npm (plataforma Angular) | Requerido por anti-FOUC (D1). Lo instala `ng add @angular/ssr`. |
| `express` | dependencia npm (server SSR) | Traída por `ng add @angular/ssr` para `server.ts`. |
| Playwright CLI | herramienta del agente (no npm del proyecto) | Verificación visual (D11), ya disponible vía skill. |

Ninguna dependencia nueva contradice la Constitución: SSR/hidratación es
plataforma Angular, compatible con zoneless; no se añade otra librería de
estilos ni axios ni estado de servidor en el Store.
