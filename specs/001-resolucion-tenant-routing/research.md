# Phase 0 — Research: Resolución de Tenant y Routing

La especificación no dejó marcadores `[NEEDS CLARIFICATION]` (5 preguntas ya
resueltas en `spec.md §Clarifications`, sesión 2026-07-04). Esta fase consolida las
**decisiones de diseño técnico** derivadas de la spec, el PRD 01 y la
Constitución/`ARCHITECTURE.md`. Cada decisión indica alternativas descartadas.

---

## D1 — La resolución es una función pura `resolveTenant`

- **Decisión**: `resolveTenant(input: TenantInput, activeSlugs: ReadonlySet<string>): TenantResolution`,
  función pura, síncrona, sin efectos, sin acceso a red ni a Angular. La lista de
  activos se **inyecta como argumento** (no la obtiene el resolver).
- **Rationale**: FR-010 (determinista/idempotente) y SC-006 (cobertura unitaria
  exhaustiva) exigen algo trivialmente testeable sin mocks de HTTP ni de router.
  Separar el *qué* (clasificación pura) del *cómo se obtienen los activos*
  (TanStack Query, D5) mantiene la disciplina de capas de la Constitución I.
- **Alternativas descartadas**:
  - *Resolver que hace el fetch de partners por dentro* → acopla lógica pura a I/O,
    rompe testabilidad y la separación síncrono/asíncrono (Constitución I).
  - *Angular `Resolve`/`ResolveFn` como pieza central* → mezcla clasificación con
    ciclo de vida del router; se usa un guard como adaptador delgado (D4), no como
    contenedor de la lógica.

## D2 — Firma extensible a `host` (subdominios futuros)

- **Decisión**: el input es un objeto `TenantInput { pathname: string; host?: string }`,
  no un `string` suelto. Hoy solo se usa `pathname` (primer segmento); `host` queda
  declarado y opcional.
- **Rationale**: FR-013 y PRD 01 §7 exigen poder evolucionar a subdominios/híbrido
  **sin reescribir a los consumidores**. Un objeto de entrada permite añadir `host`
  como fuente de resolución sin cambiar la firma.
- **Alternativas descartadas**: `resolveTenant(pathname: string)` (PRD 01 §3, *shape
  conceptual*) → cambiar a host obligaría a romper la firma y a todos los llamadores.

## D3 — Orden de evaluación: reservadas → normalización → activos → fallback

- **Decisión** (fija el algoritmo de `resolveTenant`):
  1. Extraer el **primer segmento** crudo del `pathname` (FR-001). Sin segmento ⇒
     `{ kind: 'root' }` (FR-004).
  2. **Reservadas primero**: comparar el segmento crudo **minusculizado** contra
     `RESERVED_NAMES` con **coincidencia exacta case-insensitive**, **antes** de
     normalizar (FR-005, clarificación 5). Match ⇒ `{ kind: 'reserved', area }`.
  3. **Normalizar** el candidato (D6). Si no cumple charset/longitud ⇒
     `{ kind: 'fallback', reason: 'unknown-slug' }` (FR-002).
  4. **Validar contra activos**: si el slug normalizado ∈ `activeSlugs` ⇒
     `{ kind: 'partner', slug }`; si no ⇒ `{ kind: 'fallback', reason: 'unknown-slug' }`
     (FR-003).
- **Rationale**: la precedencia de reservadas evita que `/Admin`, `/API` o
  `favicon.ico` (que no cumplen el charset de slug) se interpreten como partner o se
  descarten mal; evaluar reservadas sobre el crudo, no sobre lo normalizado, es
  exactamente lo pedido en la clarificación 5 y FR-005.
- **Nota sobre `reason: 'inactive'`**: la unión admite `'inactive'` (PRD 01 §3,
  FR-011) para que la capa de observabilidad (futura) distinga el motivo interno. En
  esta feature, cuando la fuente solo entrega **slugs activos** (D5), el resolver no
  puede diferenciar "no existe" de "inactivo" y devuelve `'unknown-slug'`. El
  literal `'inactive'` se produce únicamente si la fuente entregara estado por
  partner (evolución); **hacia el exterior la respuesta es uniforme** en ambos casos
  (FR-007, SC-003), por lo que la distinción nunca es observable.

## D4 — Adaptador de routing: `CanMatchFn` (`tenantMatch`), no `CanActivate`

- **Decisión**: la ruta `:partnerSlug` usa un **`CanMatchFn`**. Devuelve `true`
  (activa el `partner-shell`) solo si `resolveTenant` da `kind: 'partner'`; en
  cualquier otro caso devuelve `false`, con lo que la ruta **no matchea** y el router
  cae a `**` → `Landing` (fallback). Las rutas reservadas (`admin`, `api`) se
  declaran **antes** de `:partnerSlug`.
- **Rationale**:
  - `CanMatch` permite el **fall-through** natural a la landing sin `navigate`
    explícito ni redirección, dando una **respuesta uniforme** (FR-006/FR-007): la
    URL no cambia y no se filtra la causa.
  - Declarar reservadas antes garantiza su **precedencia** aun si pasaran la
    normalización (FR-005, PRD 01 §4).
  - Al publicar el resultado en el store dentro del guard, el `partnerSlug` queda
    disponible como estado síncrono para el resto de la app (D7).
- **Alternativas descartadas**:
  - `CanActivateFn` + `Router.navigate('/')` en fallo → produce redirección visible
    y URL distinta; peor para anti-enumeración y para el requisito de respuesta
    uniforme.
  - Un único componente que renderiza partner o landing según el resultado → mezcla
    responsabilidades y complica el lazy-loading por chunk (`ARCHITECTURE.md §4`).

## D5 — Lista de partners activos: TanStack Query + `ensureQueryData` en el guard

- **Decisión**: `PartnersApiService` (envuelve `HttpClient` → BFF) expone
  `getActivePartners()`. `partners-queries.ts` define
  `activePartners()` como `queryOptions` con `staleTime` = TTL (D8). El guard obtiene
  la lista con **`queryClient.ensureQueryData(partnersQueries.activePartners())`**,
  que sirve de caché si está fresca o hace fetch si no.
- **Rationale**: cumple la Constitución I (estado de servidor solo por TanStack
  Query; el guard **no** inyecta `HttpClient`) y da la **frescura acotada por TTL**
  (FR-015) y la **reutilización sin refetch** en navegación intra-partner (FR-008,
  SC-004) de forma nativa por la caché.
- **Alternativas descartadas**:
  - `injectQuery` en el guard → `injectQuery` está pensado para contexto de
    componente/inyección reactiva; en un `CanMatchFn` la vía idiomática para
    leer/forzar la caché puntualmente es `QueryClient` (`ensureQueryData`).
  - Guardar la lista de activos en el NgRx Store → prohibido por Constitución I
    (datos de API en el Store).

## D6 — Normalización del slug (`normalizeSlug`)

- **Decisión**: `normalizeSlug(raw: string): string | null`:
  `trim` → `toLowerCase` → validar contra `^[a-z0-9-]{2,40}$`. Devuelve el slug si
  cumple, `null` si no.
- **Rationale**: encapsula FR-002 en una unidad pura y testeable (longitud 2–40,
  charset kebab, minúsculas, recorte). Devolver `null` en vez de lanzar mantiene el
  resolver sin ramas de excepción.
- **Nota de orden**: la normalización se aplica **después** del chequeo de reservadas
  (D3, FR-005), nunca antes.

## D7 — Estado síncrono del tenant resuelto: `TenantStore` en `core/store/`

- **Decisión**: `TenantStore = signalStore({ providedIn: 'root' }, withState(...))`
  con el `TenantResolution` resuelto (o al menos `partnerSlug` + `kind`). El guard
  hace `patchState` al resolver; la landing publica `root`/`fallback`.
- **Rationale**: el tenant resuelto es estado **síncrono** ambiental sin feature
  dueño — el mismo criterio con que `ARCHITECTURE.md §2` ubica `tema/idioma` en
  `core/store/`; y PRD 06 lo pide explícitamente en `core/store/` como NgRx Signals.
  Habilita FR-008 (reutilización durante el journey) sin volver a resolver.
- **Alternativas descartadas**:
  - Ubicarlo en `features/tenant/store/` → no hay feature de negocio dueño; sería
    incoherente con el criterio de `tema/idioma`.
  - Exponer el slug como dato de servidor (TanStack Query) → viola Constitución I; el
    slug resuelto es una **selección** síncrona, no un recurso remoto.

## D8 — TTL de la lista de activos = `staleTime` de la query

- **Decisión**: el TTL de FR-015 se materializa como `staleTime` de la
  `queryOptions` `activePartners`. Valor por defecto **60 s**, parametrizable vía
  configuración de entorno (`environment.ts`, `ARCHITECTURE.md §8`), no hardcodeado
  en la lógica.
- **Rationale**: `staleTime` es exactamente "ventana durante la cual el dato se
  considera fresco y no se refetchea", que es la semántica de TTL pedida: una
  desactivación surte efecto dentro de la ventana. 60 s equilibra frescura de
  desactivaciones vs. carga al BFF; al ser configurable, ajustarlo no toca código.
- **Alternativas descartadas**: sin `staleTime` (siempre stale) → refetch en cada
  navegación, rompe FR-008/SC-004. TTL infinito → una desactivación no surtiría
  efecto (viola FR-015).

## D9 — Fail-safe cuando la fuente de activos falla

- **Decisión**: si `ensureQueryData` rechaza (BFF caído/error), el guard trata el
  resultado como **fallback** (`CanMatch` ⇒ `false` ⇒ landing neutra), idéntico a un
  slug desconocido. No se relanza el error a la UI ni se registra nada en esta
  feature.
- **Rationale**: FR-014 (fail-safe indistinguible) + SC-003 (anti-enumeración). La
  clarificación de observabilidad (sesión 2026-07-04) delega logs/métricas a la
  feature de observabilidad: aquí **no** se emite señal alguna.
- **Alternativas descartadas**: mostrar un error de "servicio no disponible" →
  filtra la indisponibilidad y rompe la uniformidad; reintentar agresivamente en el
  guard → latencia visible en la resolución.

## D10 — Nombres reservados: constante versionada en código

- **Decisión**: `RESERVED_NAMES` es una constante (p. ej. `ReadonlySet<string>`) en
  `core/tenant/reserved-names.ts`, con las 8 entradas de FR-005
  (`admin`, `api`, `assets`, `static`, `health`, `_next`, `favicon.ico`,
  `robots.txt`). `isReservedSegment(rawSegment)` compara en minúsculas, exacto.
- **Rationale**: es configuración de ruteo **versionada** (FR-005, edge case de
  colisión futura), no dato de runtime del BFF. Vive con el kernel para que el mismo
  `Set` alimente tanto la resolución como la **validación de alta** (FR-012, que el
  Back Office consumirá — PRD 05).
- **Alternativas descartadas**: traerla del BFF → innecesario y añade un modo de
  fallo; embeberla ad-hoc en `app.routes.ts` → duplicaría la verdad entre routing y
  la validación de alta.

## D11 — SSR y anti-FOUC quedan fuera de alcance

- **Decisión**: esta feature **no** cablea SSR (no hay builder SSR en `angular.json`)
  ni implementa el anti-FOUC/theming. Se garantiza que el resolver es puro,
  determinista e idempotente, condición necesaria para que PRD 03/06 monten SSR +
  anti-FOUC sin reescribirlo.
- **Rationale**: la spec (Assumptions) delega el theming a PRD 02/03 y los mecanismos
  SSR/CSR a PRD 03/04 como detalle de implementación; el alcance de esta feature es
  la **decisión de tenant** y su cableado de routing/estado.
- **Alternativas descartadas**: introducir `@angular/ssr` aquí → excede el alcance y
  acopla esta feature a decisiones de PRD 03/06 aún no materializadas.

---

## Resumen de decisiones

| # | Decisión | Requisitos que satisface |
|---|----------|--------------------------|
| D1 | `resolveTenant` función pura, activos por parámetro | FR-010, SC-006 |
| D2 | Input `{ pathname, host? }` extensible | FR-013 |
| D3 | Orden reservadas→normaliza→activos→fallback | FR-001,002,003,005,006,011 |
| D4 | `CanMatchFn` con fall-through a landing | FR-005,006,007 |
| D5 | Activos vía TanStack Query + `ensureQueryData` | FR-003,008,015; Const. I |
| D6 | `normalizeSlug` puro → `string \| null` | FR-002 |
| D7 | `TenantStore` síncrono en `core/store/` | FR-008; PRD 06 |
| D8 | TTL = `staleTime` (60 s, configurable) | FR-015 |
| D9 | Fail-safe = fallback silencioso | FR-014, SC-003 |
| D10 | `RESERVED_NAMES` constante versionada | FR-005, FR-012 |
| D11 | SSR/anti-FOUC fuera de alcance | Assumptions (PRD 03/06) |
