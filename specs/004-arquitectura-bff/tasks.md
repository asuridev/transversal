---
description: "Task list for Arquitectura BFF (Backend for Frontend)"
---

# Tasks: Arquitectura BFF (Backend for Frontend)

**Input**: Design documents from `/specs/004-arquitectura-bff/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — la Constitución de seguridad (SC-009) exige cobertura de
proyección pública, resolución de secretos (mockeada) y normalización de errores.
La suite es `node:test`, ya cableada en `npm run test:server`
(`src/server/**/*.test.ts`). Sin framework de testing nuevo.

**Organization**: Tareas agrupadas por historia de usuario para permitir
implementación y prueba independientes. Runtime servidor en `src/server/`,
montado desde `src/server.ts` (regla dura: ningún secreto cruza al cliente).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1..US6)
- Todas las tareas incluyen ruta de archivo exacta

## Path Conventions

Proyecto único Angular con SSR; el servidor Node **es** el BFF. Código de esta
feature en `src/server/` (`api/`, `secrets/`, `journey/`, `assets/`, `security/`,
`http/`, `observability/`), montado como router `/api/*` en `src/server.ts` antes
del catch-all SSR. Reutiliza `PartnerRepository`, `PublicTheme`, `slug-validation`,
`validateBrandAsset`, `svg-sanitize` (feature `002`) y `TransferState` (`003`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estructura de carpetas del BFF; cero dependencias npm nuevas.

- [X] T001 Crear la estructura de subdirectorios del BFF bajo `src/server/`: `api/`, `secrets/`, `journey/`, `assets/`, `security/`, `http/`, `observability/` (con un `.gitkeep` temporal donde aún no haya archivos), según `plan.md` §Project Structure
- [X] T002 Verificar que el glob de `npm run test:server` en `package.json` (`src/server/**/*.test.ts`) cubre los nuevos subdirectorios y ejecutar `npm run test:server` en verde como línea base

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esqueleto HTTP compartido que TODAS las historias necesitan: error
uniforme base, validación de entrada, logging correlacionado, router raíz `/api/*`
y su montaje antes del catch-all SSR.

**⚠️ CRITICAL**: Ninguna historia de usuario puede comenzar hasta completar esta fase.

- [X] T003 [P] Definir el tipo `ApiError` y el mapa `code→HTTP` (base, sin normalización de Mashery) más `createApiError()` en `src/server/http/api-error.ts` (data-model §3, error-normalization.contract)
- [X] T004 [P] Implementar helpers de validación de entrada (`validateSlugParam` reusando `slug-validation` de `002`, validación de body/upload) en `src/server/http/validation.ts` (FR-019)
- [X] T005 [P] Implementar generación de `requestId` por request y logger correlacionado por `partnerSlug` **sin secretos** en `src/server/observability/request-log.ts` (FR-021)
- [X] T006 Implementar el router raíz Express `/api/*` que compone sub-routers y monta middlewares (request-log, manejador de error → `ApiError`) en `src/server/api/api-router.ts`, exportando `createApiRouter(deps)` (depende de T003, T004, T005)
- [X] T007 Montar `apiRouter` en `/api` **antes** del catch-all SSR de Angular en `src/server.ts`, obteniendo el `PartnerRepository` vía `createPartnerRepository()` (depende de T006)

**Checkpoint**: Frontera `/api/*` viva con esqueleto de error/logging; las historias pueden comenzar.

---

## Phase 3: User Story 1 - Ningún secreto llega jamás al browser (Priority: P1) 🎯 MVP

**Goal**: Garantizar la regla dura: solo la proyección pública cruza al cliente
(allowlist de `TransferState`), los endpoints públicos limitan tasa, y ninguna
respuesta/log filtra secretos.

**Independent Test**: Inspeccionar el `TransferState` y las respuestas serializadas
→ solo `PublicTheme`; un intento de serializar otro campo se rechaza; una ráfaga
sobre un endpoint público → `429`; los logs no contienen `apiKey`.

### Tests for User Story 1 ⚠️

> **NOTE: Escribir estos tests PRIMERO y verificar que FALLAN antes de implementar.**

- [X] T008 [P] [US1] Test de allowlist de `TransferState` (solo `PublicTheme` pasa; cualquier otro campo/secreto se rechaza) en `src/server/security/transfer-state-allowlist.test.ts` (FR-022, SC-007)
- [X] T009 [P] [US1] Test del rate limiter in-memory por IP+ruta (ráfaga sobre umbral → `429`; tráfico normal no afectado) en `src/server/security/rate-limit.test.ts` (FR-020)

### Implementation for User Story 1

- [X] T010 [P] [US1] Implementar la allowlist de `TransferState` (valida server-side que solo la clave/forma de `PublicTheme` se serialice) en `src/server/security/transfer-state-allowlist.ts` (FR-022)
- [X] T011 [P] [US1] Implementar el rate limiter in-memory por IP+ruta (single-node) que emite `429 rate_limited` en `src/server/security/rate-limit.ts` (FR-020)
- [X] T012 [US1] Enrutar la escritura del theme resuelto a través de la allowlist en `src/app/core/theme/theme-transfer.ts` (refuerza la garantía de `003`; depende de T010)
- [X] T013 [US1] Registrar el middleware de rate limiting en el router raíz para las rutas públicas en `src/server/api/api-router.ts` (depende de T011)

**Checkpoint**: La frontera garantiza cero secretos al cliente y limita la enumeración; verificable de forma independiente.

---

## Phase 4: User Story 2 - El journey se orquesta con las credenciales del partner correcto (Priority: P1)

**Goal**: Resolver `partnerSlug → { baseUrl, apiKey }` del lado servidor por request
y orquestar el journey contra Mashery usando **exclusivamente** las creds de ese
partner, sin que el `apiKey` cruce jamás al cliente.

**Independent Test**: Ejecutar una acción del journey para el partner A → la llamada
saliente golpea `baseUrl`/`apiKey` de A (mockeados); dos partners no se mezclan;
`resolve()===null` → `502 mashery_unavailable`; la respuesta/log no contiene `apiKey`.

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Test del `EnvSecretResolver` (resuelve creds por slug desde env; `isConfigured` devuelve boolean sin el valor; el `apiKey` no se serializa) en `src/server/secrets/env-secret-resolver.test.ts` (FR-003, SC-009)
- [X] T015 [P] [US2] Test de orquestación por partner (llamada saliente usa `baseUrl`+`apiKey` del partner correcto; A y B no se mezclan; `resolve()===null` → `mashery_unavailable`) en `src/server/journey/orchestrate-journey.test.ts` (FR-011/012, SC-003)

### Implementation for User Story 2

- [X] T016 [P] [US2] Definir el puerto `SecretResolver` (`resolve`, `invalidate`, `isConfigured`) y el tipo `IntegrationCreds` en `src/server/secrets/secret-resolver.ts` (data-model §1.2, FR-003/005/006)
- [X] T017 [US2] Implementar el adaptador V1 `EnvSecretResolver` (lee env por slug + caché in-memory básica) y la factory `createSecretResolver()` en `src/server/secrets/env-secret-resolver.ts` (depende de T016)
- [X] T018 [P] [US2] Implementar el cliente HTTP de Mashery con `fetch` nativo (sin axios) — timeout por intento (`AbortSignal.timeout`), reintentos acotados y circuit breaker por partner en `src/server/journey/mashery-client.ts` (FR-014, D2/D5)
- [X] T019 [US2] Implementar `orchestrateJourney()` que resuelve creds vía `SecretResolver`, invoca `mashery-client` con las creds de ESE partner y mapea `resolve()===null` → `mashery_unavailable` en `src/server/journey/orchestrate-journey.ts` (depende de T017, T018; FR-011/012)
- [X] T020 [US2] Implementar `POST /api/journey/:slug/*` (valida slug/body, invoca `orchestrateJourney`, log correlacionado sin `apiKey`) en `src/server/api/journey-router.ts` y componerlo en `api-router.ts` (depende de T019; FR-011/019/021)

**Checkpoint**: El journey golpea Mashery con las creds del partner correcto, resueltas server-side, sin fuga de secretos.

---

## Phase 5: User Story 3 - El theme público se sirve por slug, cacheado (Priority: P1)

**Goal**: Servir la proyección pública `PublicTheme` por slug (con fallback default
indistinguible) y la lista de slugs activos, ambos cacheados y sin secretos.

**Independent Test**: `GET /api/theme/:slug` responde el shape público de `002` con
`Cache-Control`+`ETag`; `If-None-Match` igual → `304`; slug inexistente → `200`
default (no `404`); slug inválido → `400`; `GET /api/partners/active` → `{slugs}`
solo activos.

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] Test de `GET /api/theme/:slug` (shape `PublicTheme` sin `apiKey`/`baseUrl`/IDs; `Cache-Control`+`ETag`; `304` con `If-None-Match`; inexistente→default; inválido→`400`) en `src/server/api/api-router.test.ts` (FR-007/008/010/019, SC-004, SC-009)
- [X] T022 [P] [US3] Test de `GET /api/partners/active` (solo slugs activos, excluye `__default__`; sin metadatos sensibles; ráfaga→`429`) en `src/server/api/api-router.test.ts` (FR-009/020)

### Implementation for User Story 3

- [X] T023 [US3] Implementar `GET /api/theme/:slug` (valida slug; `getPublishedTheme`+`findBySlug`→`toPublicTheme`; fallback `getDefaultPublicTheme`; `Cache-Control`+`ETag` derivado de `version`; `304`) en `src/server/api/public-router.ts` (FR-007/008/018, D8)
- [X] T024 [US3] Implementar `GET /api/partners/active` (`findActiveSlugs()` → `{ slugs }`, `Cache-Control` corto) en `src/server/api/public-router.ts` (FR-009/018)
- [X] T025 [US3] Componer `public-router` en `api-router.ts` aplicando el rate limiter público de US1 a `/api/theme` y `/api/partners/active` (depende de T023, T024, T011; FR-020)

**Checkpoint**: Los tres P1 (US1+US2+US3) entregan la experiencia pública segura y cacheada — MVP completo.

---

## Phase 6: User Story 4 - Los endpoints de administración están protegidos (Priority: P2)

**Goal**: Exponer `/api/admin/*` protegidos por el seam `adminAuthGuard`
(default-deny V1), sin devolver secretos en claro (solo `credentialConfigured`), con
intermediación de uploads a object storage.

**Independent Test**: Cualquier `/api/admin/*` sin sesión → `401/403` sin efecto; con
sesión, `GET /api/admin/partners` expone `credentialConfigured` (boolean) sin el
secreto; `POST /api/admin/assets` valida y sube vía `AssetStorage` sin exponer creds.

### Tests for User Story 4 ⚠️

- [X] T026 [P] [US4] Test de protección admin (sin sesión válida → `401/403` sin ejecutar acción; con sesión, respuesta con `credentialConfigured` y **sin** `apiKey`/`baseUrl` — test de serialización) en `src/server/api/api-router.test.ts` (FR-015/016, SC-006)

### Implementation for User Story 4

- [X] T027 [P] [US4] Definir el puerto `AdminAuthGuard` + tipo `AdminSession` con adaptador V1 **default-deny** y factory `createAdminAuthGuard()` en `src/server/security/admin-auth-guard.ts` (data-model §1.4, FR-015, seam PRD 06)
- [X] T028 [P] [US4] Definir el puerto `AssetStorage` + tipo `StoredAssetRef` (`put`, `createSignedUploadUrl?`) con adaptador V1 en `src/server/assets/asset-storage.ts` (data-model §1.3, FR-017)
- [X] T029 [US4] Implementar `admin-router.ts` con los 7 endpoints (list/create/patch/publish/deactivate/assets/audit) protegidos por `adminAuthGuard`, accediendo a datos **solo** vía `PartnerRepository` y exponiendo `credentialConfigured` vía `SecretResolver.isConfigured` en `src/server/api/admin-router.ts` (depende de T027, T017; FR-015/016/018)
- [X] T030 [US4] Implementar el upload de assets en `POST /api/admin/assets` (valida con `validateBrandAsset`+`svg-sanitize` de `002`; intermedia vía `AssetStorage.put`; devuelve `StoredAssetRef`; binario inválido→`400`) en `src/server/api/admin-router.ts` (depende de T028; FR-017/019)
- [X] T031 [US4] Componer `admin-router` en `api-router.ts` bajo `/api/admin` con el guard aplicado primero (depende de T029, T030)

**Checkpoint**: El Back Office opera sobre una frontera protegida sin exponer secretos.

---

## Phase 7: User Story 5 - Rotar una credencial surte efecto sin redeploy (Priority: P2)

**Goal**: La rotación de una credencial en el gestor de secretos surte efecto en las
acciones posteriores del journey dentro de la ventana de refresco, sin redeploy.

**Independent Test**: Cambiar el env/mock de un partner e `invalidate()` (o esperar
el TTL) → la siguiente `resolve()` relee el valor nuevo; una acción del journey
posterior usa la credencial nueva.

### Tests for User Story 5 ⚠️

- [X] T032 [P] [US5] Test de rotación (caché con TTL corto; `invalidate(slug)` fuerza relectura; tras la ventana la siguiente `resolve` devuelve el valor nuevo, sin redeploy) en `src/server/secrets/env-secret-resolver.test.ts` (FR-006, SC-005)

### Implementation for User Story 5

- [X] T033 [US5] Extender `EnvSecretResolver` con caché de TTL corto e `invalidate(slug)` (relectura en caliente en la ventana de refresco) en `src/server/secrets/env-secret-resolver.ts` (depende de T017; FR-006, D4)

**Checkpoint**: Una credencial rotada se aplica sin redeploy dentro de la ventana definida.

---

## Phase 8: User Story 6 - Los errores de Mashery se normalizan sin filtrar detalles (Priority: P3)

**Goal**: Traducir todo fallo de Mashery al `ApiError` uniforme del front, sin filtrar
trazas/endpoints/mensajes crudos, con resiliencia acotada (timeout/breaker).

**Independent Test**: Forzar distintos fallos de Mashery (500, timeout, cuerpo con
endpoint interno) → el front recibe siempre `ApiError` (`code`/`message`/`requestId`)
sin detalles internos; un Mashery lento no cuelga indefinidamente.

### Tests for User Story 6 ⚠️

- [X] T034 [P] [US6] Test de `normalizeMasheryError` (distintos fallos → `ApiError` uniforme sin URL/`apiKey`/stack/cuerpo crudo; `requestId` no vacío; `invalid_input` detalla campo, no valor) en `src/server/http/api-error.test.ts` (FR-013, SC-008)
- [X] T035 [P] [US6] Test de resiliencia (timeout acota la request; breaker abre tras N fallos → `mashery_unavailable` inmediato hasta cooldown) en `src/server/journey/orchestrate-journey.test.ts` (FR-014)

### Implementation for User Story 6

- [X] T036 [US6] Implementar `normalizeMasheryError(raw): ApiError` (única función que traduce errores de Mashery, sin fugas) y los códigos restantes (`mashery_error`, `mashery_unavailable`, `internal`) en `src/server/http/api-error.ts` (depende de T003; FR-013)
- [X] T037 [US6] Enrutar los errores de Mashery en `orchestrate-journey`/`journey-router` a través de `normalizeMasheryError` (ningún handler construye errores con datos de Mashery) en `src/server/journey/orchestrate-journey.ts` y `src/server/api/journey-router.ts` (depende de T036, T020)

**Checkpoint**: Todos los fallos de Mashery llegan al front en formato uniforme, sin filtraciones.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Verificación transversal y cierre.

- [X] T038 Ejecutar `npm run test:server` completo en verde, confirmando cobertura mínima de SC-009 (proyección pública, resolución de secretos mockeada, normalización de errores)
- [X] T039 [P] Ejecutar la validación manual de red de `quickstart.md` (curl de theme cacheado/`304`, slugs activos, journey por partner, rotación, admin `401/403`) contra `npm run build && npm run serve:ssr`
- [X] T040 [P] Auditoría de la regla dura (SC-001/002/007): inspección de bundle + network tab + `TransferState` durante un journey (opcional: Playwright CLI) confirmando **cero** `apiKey`/endpoints de Mashery/IDs de integración
- [X] T041 Revisión final de logs (FR-021): confirmar que ningún log incluye `apiKey`/`extra`/payloads sensibles en las rutas journey/admin

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — comienza de inmediato.
- **Foundational (Phase 2)**: Depende de Setup — **BLOQUEA** todas las historias.
- **User Stories (Phase 3–8)**: Todas dependen de Foundational.
  - US1, US2, US3 (P1) pueden desarrollarse en paralelo tras Foundational.
  - US5 (P2) depende de US2 (extiende `EnvSecretResolver`).
  - US6 (P3) depende de US2 (envuelve `orchestrate-journey`/`journey-router`).
  - US4 (P2) consume `SecretResolver.isConfigured` de US2 y el repositorio de `002`.
- **Polish (Phase 9)**: Depende de las historias deseadas completas.

### User Story Dependencies

- **US1 (P1)**: Solo Foundational. Independiente. US3 aplica su rate limiter.
- **US2 (P1)**: Solo Foundational. Independiente.
- **US3 (P1)**: Foundational + el rate limiter de US1 (T011) para el paso de wiring T025.
- **US4 (P2)**: Foundational + `SecretResolver` de US2 (`isConfigured`).
- **US5 (P2)**: US2 (extiende el mismo adaptador de secretos).
- **US6 (P3)**: US2 (normaliza los errores de la orquestación del journey).

### Within Each User Story

- Los tests se escriben y **fallan** antes de la implementación.
- Puertos/tipos antes que adaptadores; adaptadores antes que routers; wiring al final.
- Historia completa antes de pasar a la siguiente prioridad.

### Parallel Opportunities

- Setup: T003–T005 en paralelo (archivos distintos).
- US1: T008/T009 (tests) en paralelo; T010/T011 (impl) en paralelo.
- US2: T014/T015 (tests) en paralelo; T016 y T018 en paralelo.
- US4: T027/T028 (puertos) en paralelo.
- Tras Foundational, US1/US2/US3 pueden abordarse por desarrolladores distintos.

---

## Parallel Example: User Story 2

```bash
# Tests de US2 juntos (deben fallar primero):
Task: "Test EnvSecretResolver en src/server/secrets/env-secret-resolver.test.ts"
Task: "Test orquestación por partner en src/server/journey/orchestrate-journey.test.ts"

# Piezas independientes de US2 juntas:
Task: "Puerto SecretResolver en src/server/secrets/secret-resolver.ts"
Task: "Cliente Mashery (fetch+timeout+retry+breaker) en src/server/journey/mashery-client.ts"
```

---

## Implementation Strategy

### MVP First (los tres P1)

1. Completar Phase 1: Setup.
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todas las historias).
3. Completar US1 + US2 + US3 (todas P1) → la experiencia pública segura, orquestada
   y cacheada es el MVP entregable.
4. **PARAR y VALIDAR**: theme cacheado sin secretos, journey por partner correcto,
   allowlist/rate-limit activos.
5. Deploy/demo del MVP.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 → frontera segura (allowlist + rate-limit) → validar.
3. US2 → orquestación por partner → validar.
4. US3 → theme/slugs públicos cacheados → validar → **MVP (P1) completo**.
5. US4 → admin protegido → validar.
6. US5 → rotación sin redeploy → validar.
7. US6 → normalización de errores → validar.

### Parallel Team Strategy

Tras Foundational: Dev A → US1, Dev B → US2, Dev C → US3. Luego US4/US5/US6 sobre US2.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Cero dependencias npm nuevas (sin axios, sin rate-limit/breaker externos).
- `PartnerRepository` (`002`) es la **única** vía de datos; ningún handler ejecuta SQL.
- El `apiKey`/`baseUrl` nunca se serializan al cliente ni al `TransferState` ni a logs.
- Verificar que los tests fallan antes de implementar; commit tras cada tarea o grupo lógico.
