# Implementation Plan: Arquitectura BFF (Backend for Frontend)

**Branch**: `004-arquitectura-bff` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-arquitectura-bff/spec.md`

## Summary

Esta feature materializa la **frontera pública `/api/*`** del producto: los
**route handlers Node/Express** que hoy `src/server.ts` no expone (solo monta el
catch-all de SSR de la feature `003`). Convierte el servidor de render en el
**BFF único** —un repo, un deploy— y garantiza la **regla dura**: *ningún token,
API key ni ID de integración llega jamás al browser*.

Enfoque técnico (fijado por PRD 00/04 y la Constitución):

1. **Router `/api/*` montado antes del catch-all SSR** en `src/server.ts`. Tres
   familias: **público** (`/api/theme/:slug`, `/api/partners/active`), **journey**
   (`POST /api/journey/:slug/*`, proxy orquestado a Mashery) y **admin**
   (`/api/admin/*`, protegido — mecanismo de identidad en PRD 06).
2. **Puerto `PartnerRepository` (feature `002`) como única vía de persistencia**:
   ningún handler ejecuta SQL directo; los endpoints públicos/admin lo consumen
   in-process (mismo patrón que el resolver SSR de `003`).
3. **Puerto `SecretResolver`**: resuelve `partnerSlug → { baseUrl, apiKey, … }`
   del gestor de secretos **por request**, del lado servidor, con **caché corta +
   invalidación** (rotación sin redeploy). `baseUrl` es el endpoint único de
   Mashery (fijo, compartido por todos los partners); `apiKey` es la
   credencial propia de cada partner contra ese mismo Mashery. Adaptador V1 =
   variables de entorno; swap futuro a Vault/cloud sin tocar handlers. **Nunca**
   se serializa al cliente.
4. **Orquestación del journey** contra Mashery con el **cliente HTTP nativo de
   Node (`fetch`/`undici`)** — sin `axios` (la regla protege el bundle del
   cliente). Con **timeout (`AbortSignal.timeout`), reintentos acotados y corte de
   circuito**, y **normalización de errores** al formato uniforme del front
   (alineado con `error-interceptor`, ARCHITECTURE §3), sin filtrar detalles.
5. **Seguridad de frontera**: **rate limiting** in-memory (single-node) en
   endpoints públicos, **validación de entrada** en todos (reusa
   `slug-validation`, `asset-validation` de `002`), **allowlist de `TransferState`**
   (solo `PublicTheme` cruza), **`Cache-Control`** en el theme público para
   reutilización server/CDN.
6. **Intermediación de uploads** a object storage vía puerto `AssetStorage` (URL
   firmada o proxy), sin exponer credenciales del almacenamiento.
7. **Observabilidad**: logs de error y trazas **correlacionadas por `partnerSlug`**
   (sin secretos), con un `requestId` por petición (PRD 07).

Alcance = **la frontera HTTP `/api/*` y sus garantías de seguridad**. Quedan
**fuera**: el mecanismo concreto de identidad/SSO admin (PRD 06 — aquí solo el
**seam** de protección), la UI del Back Office (PRD 05) y Mashery real de seguros
(mockeado en prueba). El contrato del theme público y su proyección son de `002`;
esta feature **los sirve**, no los redefine.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict). Runtime servidor **Node 22.20**
(`fetch`/`undici`, `AbortSignal.timeout`, `node:sqlite` ya usados por `002`/`003`).
El front (Angular 20.3) ya consume estos endpoints (`ThemeApiService`,
`PartnersApiService`) y no cambia su contrato.

**Primary Dependencies**:
- **Ya presente (sin instalar)**: `express` (host SSR de `003`), `@angular/ssr/node`
  (`AngularNodeAppEngine`), `node:sqlite` vía `SqlitePartnerRepository` (`002`).
  `fetch`/`AbortSignal` son **nativos** de Node 22 — sin dependencia nueva.
- **Consumido de otras features**: `PartnerRepository` + `createPartnerRepository`
  (`002`, `src/server/persistence/`), `toPublicTheme`/`PublicTheme`/
  `getDefaultPublicTheme` (`002`, `src/shared/partner/`), `resolveTenant`/
  `TenantResolution` (`001`, `src/app/core/tenant/`), `validateBrandAsset`/
  `slug-validation` (`002`, `src/server/`).
- **Nuevo en esta feature (código propio, sin librerías nuevas)**: puertos
  `SecretResolver`, `AssetStorage`, `AdminAuthGuard` (seam PRD 06); cliente de
  journey (timeout/retry/circuit-breaker en-house); rate limiter in-memory;
  normalizador de error; logger correlacionado. **Cero dependencias npm nuevas**
  (evita `axios`, `express-rate-limit`, breakers externos: single-node V1 los
  hace triviales en-house y mantiene la superficie mínima — ver `research.md`).

**Storage**: Persistencia de partners = **SQLite tras `PartnerRepository`** (`002`),
consumida in-process; esta feature **no** crea tablas ni migra. Secretos = **gestor
de secretos / env** (fuera de SQLite; nunca se mezclan — FR-005). Assets = **object
storage** vía puerto (adaptador real fuera de V1; seam definido).

**Testing**: **`node:test`** (`npm run test:server`, ya configurado para
`src/server/**/*.test.ts`). Cubre —exigido por la Constitución de seguridad
(SC-009)— **proyección pública**, **resolución de secretos (mockeada)** y
**normalización de errores**; además rate limiting, validación, allowlist de
TransferState, y orquestación por partner con `SecretResolver`/Mashery mockeados.
Sin framework de testing nuevo (ARCHITECTURE §9). Playwright CLI queda como
verificación manual del agente (no CI).

**Target Platform**: Node 22.20 (servidor único). Los handlers `/api/*` corren
**solo** server-side; el browser solo habla HTTPS mismo-origen con `/api/*`.

**Project Type**: Aplicación web Angular de proyecto único **con SSR**, cuyo
servidor Node **es** el BFF (un repo, un deploy). El código de esta feature vive
en `src/server/` (runtime servidor), montado desde `src/server.ts`.

**Performance Goals**: `GET /api/theme/:slug` sirve la proyección pública
**cacheada** (`Cache-Control`) reutilizable en server/CDN sin reconsultar origen en
cada visita (SC-004). La resolución de secretos usa **caché corta** para no golpear
el gestor por request repetida, con invalidación en la ventana de refresco (SC-005).
El journey acota latencia con timeout + reintentos acotados (SC-008).

**Constraints**:
- **Regla dura (SC-001/002/007)**: cero secretos/endpoints/IDs de integración en
  bundle, red o `TransferState`; el browser habla **solo** con `/api/*`.
- **Secretos server-side por request (FR-003)**: leídos del `SecretResolver`, nunca
  serializados; **allowlist** explícita de `TransferState` (solo `PublicTheme`).
- **Puerto de repositorio (FR-018)**: ningún handler ejecuta SQL directo.
- **Sin `axios` (Constitución I)**: el cliente de Mashery usa `fetch` nativo; la
  regla protege el bundle del cliente y no se viola en el runtime servidor.
- **Config vs secreto separados (FR-005)**: theme en SQLite, credenciales en el
  gestor de secretos; nunca el mismo almacén.
- **Single-node V1**: rate limiter, caché de secretos y circuit breaker son
  in-memory; el escalado se habilita cambiando adaptadores (repo→Postgres,
  limiter→store compartido), sin reescribir handlers.
- **Admin protegido (FR-015)**: seam de autorización que rechaza sin sesión válida;
  el mecanismo de identidad es PRD 06.

**Scale/Scope**: ~7 grupos de módulos server (`api/`, `secrets/`, `journey/`,
`assets/`, `security/`, `http/`, `observability/`), 1 router Express montado en
`src/server.ts`, 3 puertos nuevos con adaptador V1, endpoints: 2 públicos + 1
journey + 7 admin (PRD 04 §4). Front sin cambios de contrato (endpoints ya
asumidos por `ThemeApiService`/`PartnersApiService`).

## Constitution Check

*GATE: Debe pasar antes de Phase 0. Re-evaluado tras Phase 1 (ver final).*

La Constitución (I–IV) gobierna el **front Angular** (estado, componentes, DI,
estilos/zoneless). Esta feature es **runtime servidor** (route handlers Node): sus
principios aplican a las piezas front que la tocan y a la **regla anti-axios**, que
es explícitamente sobre el bundle del cliente.

**I. Estado y Datos — Separación Síncrono/Asíncrono** — ✅ CUMPLE
- **Sin `axios`**: el cliente de Mashery usa `fetch`/`undici` **nativo de Node**
  (PRD 04 §6); la prohibición protege el bundle del cliente y no se toca. El front
  ya accede al theme vía **TanStack Query** (`ThemeQueries`) sembrada por
  `TransferState`, y a los slugs activos vía su query — esta feature solo provee el
  **transporte HTTP** que esas capas ya asumen (`ThemeApiService.getTheme` →
  `GET /api/theme/:slug`; `PartnersApiService` → `GET /api/partners/active`). Ningún
  componente inyecta `HttpClient` directamente. Disciplina de capas intacta.

**II. Componentes Standalone y OnPush** — ✅ CUMPLE (N/A directo)
- La feature no crea componentes de UI. No introduce `NgModule` ni cambia detección
  de cambios. Sin impacto.

**III. Inyección de Dependencias** — ✅ CUMPLE
- No añade servicios Angular. Los **puertos** server (`SecretResolver`,
  `AssetStorage`, `AdminAuthGuard`, `PartnerRepository`) se resuelven vía
  **factories** planas de Node (patrón `createPartnerRepository` de `002`), no vía
  el inyector de Angular — es código de runtime servidor fuera del árbol DI del
  front. No usa inyección por constructor de Angular.

**IV. Estilos y Zoneless** — ✅ CUMPLE (N/A directo)
- No añade CSS ni librerías de estilo. No toca detección de cambios ni `zone.js`.
  Sin impacto.

**Decisiones nuevas que la Constitución no cubre explícitamente** (detalladas en
`research.md`, ninguna en conflicto con I–IV):
1. **Router Express `/api/*` en el runtime servidor** (D1): montado en el mismo
   proceso SSR ya introducido por `003`. Plataforma de servidor, no librería de
   estado/estilo del front; compatible con todo lo anterior.
2. **Cliente HTTP nativo (`fetch`/`undici`) para Mashery** (D2): cumple la regla
   anti-axios (es el runtime servidor, no el bundle). Sin dependencia npm nueva.
3. **Puertos server con adaptador V1 (env/in-memory)** (D3–D5): `SecretResolver`,
   `AssetStorage`, rate limiter y circuit breaker in-house y single-node; el
   escalado se habilita cambiando el adaptador (igual que `PartnerRepository`→
   Postgres en `002`). No introduce complejidad injustificada.
4. **Seam de autorización admin** (D6): esta feature **exige** la protección
   (rechaza sin sesión); el mecanismo de identidad/SSO es PRD 06. Frontera
   documentada, sin adelantar la implementación de identidad.

**Resultado del gate**: **PASA** sin violaciones. **Complexity Tracking** vacía: la
frontera `/api/*` es el motivo de existir de la capa (regla dura del producto), no
complejidad injustificada.

## Project Structure

### Documentation (this feature)

```text
specs/004-arquitectura-bff/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Phase 0 — decisiones D1..D10 y alternativas
├── data-model.md        # Phase 1 — puertos, entidades de frontera, error uniforme
├── quickstart.md        # Phase 1 — validación ejecutable (node:test + curl/red)
├── contracts/           # Phase 1
│   ├── public-endpoints.contract.md   # /api/theme/:slug, /api/partners/active (FR-007..010, 019, 020)
│   ├── journey-proxy.contract.md      # POST /api/journey/:slug/* + secretos + resiliencia (FR-011..014)
│   ├── admin-endpoints.contract.md    # /api/admin/* protegidos + no-secretos (FR-015..017)
│   ├── error-normalization.contract.md# formato uniforme del front (FR-013, SC-008)
│   └── security-boundary.contract.md  # allowlist TransferState, rate limit, secretos (FR-002..006, 021, 022)
├── checklists/
│   └── (existente)      # calidad de la spec
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Runtime servidor en `src/server/` (ya alberga `persistence/`, `theme/`, `assets/`
de `002`). El BFF añade subdirectorios por responsabilidad y **monta un router**
en `src/server.ts` (hoy solo catch-all SSR). El front no cambia de contrato.

```text
src/
  server.ts                              # + monta apiRouter ANTES del catch-all SSR   [editar]
  server/
    api/
      api-router.ts                      # Express Router raíz /api/* (compone sub-routers + middlewares)
      public-router.ts                   # GET /api/theme/:slug, GET /api/partners/active (FR-007..010)
      journey-router.ts                  # POST /api/journey/:slug/* (orquestación, FR-011..014)
      admin-router.ts                    # /api/admin/* (protegido por adminAuthGuard, FR-015..017)
      api-router.test.ts
    secrets/
      secret-resolver.ts                 # puerto SecretResolver + tipo IntegrationCreds (FR-003/005/006)
      env-secret-resolver.ts             # adaptador V1: env vars + caché corta/invalidación
      env-secret-resolver.test.ts
    journey/
      mashery-client.ts                  # fetch nativo + timeout + retry acotado + circuit breaker (FR-014)
      orchestrate-journey.ts             # resuelve creds del partner e invoca Mashery (FR-011/012)
      orchestrate-journey.test.ts
    assets/
      asset-storage.ts                   # puerto AssetStorage (URL firmada / proxy) (FR-017)
      asset-validation.ts …              # (de 002) reusado por el upload admin
    security/
      admin-auth-guard.ts                # seam de autorización admin (rechaza sin sesión; mecanismo → PRD 06)
      rate-limit.ts                      # limiter in-memory por IP+ruta (single-node) (FR-020)
      transfer-state-allowlist.ts        # allowlist de campos serializables al cliente (FR-022)
      rate-limit.test.ts
      transfer-state-allowlist.test.ts
    http/
      api-error.ts                       # ApiError uniforme + normalizeMasheryError (FR-013)
      validation.ts                      # helpers de validación de entrada (slug/body/upload) (FR-019)
      api-error.test.ts
    observability/
      request-log.ts                     # log/traza correlacionada por partnerSlug + requestId, sin secretos (FR-021)
    persistence/ …                       # (de 002) PartnerRepository — consumido por los handlers
    theme/ …                             # (de 002) default-theme — fallback público
  shared/partner/ …                      # (de 002) PublicTheme/toPublicTheme — proyección servida
  app/
    features/theming/services/theme-api.ts     # (de 003) ya llama GET /api/theme/:slug — sin cambios
    features/partners/services/partners-api.ts  # (de 003) ya llama GET /api/partners/active — sin cambios
    core/theme/theme-transfer.ts                # (de 003) escritura de TransferState — pasa por allowlist  [posible ajuste]
```

Notas de estructura:
- **`src/server.ts`** deja de ser solo host SSR: monta `apiRouter` en `/api` (con
  rate limit + validación + logging) **antes** del `app.use` catch-all de Angular,
  de modo que `/api/*` nunca cae al render SSR.
- **`PartnerRepository` (de `002`)** es la **única** vía de datos de los handlers
  público/admin (FR-018); se obtiene con `createPartnerRepository()`, igual que el
  resolver SSR de `003` — sin duplicar persistencia.
- **`SecretResolver`/`AssetStorage`/`AdminAuthGuard`** son **puertos** con adaptador
  V1; el mismo patrón factory de `002` permite el swap a Vault/cloud/SSO sin tocar
  los handlers.
- **`TransferState` (de `003`)**: la escritura del theme resuelto pasa por la
  **allowlist** (`transfer-state-allowlist.ts`) que garantiza que solo `PublicTheme`
  cruce al cliente (FR-022); refuerza —server-side— la garantía ya asumida por `003`.

**Structure Decision**: Proyecto único Angular con SSR; el **servidor Node es el
BFF**. El código de esta feature vive en `src/server/` organizado por
responsabilidad (`api/`, `secrets/`, `journey/`, `assets/`, `security/`, `http/`,
`observability/`) y se **monta como router `/api/*`** en `src/server.ts` antes del
catch-all SSR. Reutiliza el puerto `PartnerRepository` (`002`), la proyección
pública `PublicTheme` (`002`) y el `resolveTenant`/`TransferState` (`001`/`003`);
introduce los puertos `SecretResolver`, `AssetStorage` y el seam `AdminAuthGuard`
(mecanismo de identidad → PRD 06), todos con adaptador single-node V1 y **cero
dependencias npm nuevas**.

## Complexity Tracking

> Sin violaciones de la Constitución. La frontera `/api/*` no es complejidad
> injustificada: es la **regla dura del producto** (ningún secreto al browser) y una
> decisión ya fijada por PRD 00/04. Tabla intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Check (tras Phase 1)

Re-evaluado con `data-model.md` y `contracts/` ya definidos:

- **I** — ✅ Confirmado: `contracts/journey-proxy.contract.md` usa `fetch` nativo (sin
  axios); `contracts/error-normalization.contract.md` mantiene el formato alineado
  con el `error-interceptor` del front. Ningún componente toca `HttpClient` de más;
  el front consume los mismos contratos que `002`/`003` ya asumían.
- **II** — ✅ Confirmado: sin componentes nuevos; N/A sin impacto.
- **III** — ✅ Confirmado: puertos server vía factories planas (patrón `002`), fuera
  del árbol DI de Angular; el front sigue con `inject()`.
- **IV** — ✅ Confirmado: sin CSS ni cambios zoneless.

**Resultado**: **PASA**. Sin nuevas violaciones introducidas por el diseño. Listo
para `/speckit-tasks`.
</content>
</invoke>
