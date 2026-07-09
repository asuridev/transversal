# Implementation Plan: AuthZ, Roles y Auditoría (Back Office)

**Branch**: `006-authz-roles-auditoria` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-authz-roles-auditoria/spec.md`

## Summary

Esta feature cierra la **seguridad del Back Office**: autentica a los usuarios
internos contra el **IdP corporativo RH-SSO 7.6** vía **OIDC Authorization Code +
PKCE mediado por el BFF**, emite una **cookie de sesión sellada httpOnly** (el
token del IdP nunca llega al navegador), deriva **roles de aplicación**
(`platform-admin`, `partner-editor`, `auditor`) desde los claims del IdP mediante
un mapeo configurable, **autoriza cada `/api/admin/*` server-side** (401 sin
sesión, 403 sin rol) con protección **CSRF**, y **enriquece la auditoría**
inmutable y transaccional ya existente (actor legible + versión de theme) con
**consulta filtrable** por partner/actor/rango de fechas.

El grueso es **BFF/server-side** (Node/Express en `src/server/`), porque ahí vive
la frontera de seguridad efectiva (PRD 04/06). El front (Angular) aporta el
**wiring de guards** (`authGuard → roleGuard(...)`), el **bootstrap de sesión**
(whoami vía TanStack Query → `AuthStore` síncrono) y un **interceptor CSRF** — sin
manejar tokens, como UX y no como barrera real. En **desarrollo** el IdP se
levanta con **podman-compose** usando la MISMA imagen `sso76-openshift-rhel8:7.6`
de producción (paridad dev/prod, petición explícita del usuario).

Enfoque técnico (fijado por PRD 06/04, ARCHITECTURE, Constitución y `research.md`):

1. **OIDC en el BFF con `openid-client` v6** (única dependencia npm nueva, D1):
   discovery + PKCE S256 + `authorizationCodeGrant` con validación de firma/aud/
   exp/nonce; el token del IdP se valida y **se descarta** server-side (FR-002/003).
2. **Sesión sellada stateless** (D2): cookie `bo_session` httpOnly+Secure+
   SameSite=Strict con payload `{sub,name,roles,exp}` cifrado AES-256-GCM
   (`node:crypto`, cero deps). `exp` corto (D3), sin refresh en V1 ⇒ re-login
   re-deriva roles (FR-014).
3. **CSRF double-submit** (D4): cookie `csrf` + header `X-CSRF-Token` verificados
   en cada mutación admin (FR-013).
4. **Mapeo claim→rol configurable** (D5): `ROLE_CLAIM_PATH` + `ROLE_MAP` de
   entorno, resuelto server-side; sin rol mapeable ⇒ `[]` ⇒ 403 (menor privilegio,
   FR-004).
5. **Adaptador real de `AdminAuthGuard`** (D6): reemplaza el default-deny V1
   implementando el **puerto ya existente** — `admin-router.ts` no cambia su forma.
   **RBAC por endpoint** `requireRole(...)` (D7) materializa la matriz de PRD 06 §3.
6. **Auditoría enriquecida** (D8/D9): `AuditEntry` + `audit_log` ganan
   `actorName` y `themeVersion`; `AuditQuery` gana filtros `entityId/actorSub/
   from/to`; `GET /api/admin/audit` los expone con rol `auditor`/`platform-admin`.
   Inmutabilidad y transaccionalidad **ya provistas** por el adaptador — no se
   relajan.
7. **Front** (D10): `AuthUser` pasa a `roles[]`+`name`; `roleGuard` a variádico;
   `AuthQueries.session()` → `AuthApiService` → `GET /api/admin/session` puebla
   `AuthStore` en `onSuccess`; interceptor CSRF funcional. Reusa los seams
   `auth.store`/`auth-guard`/`role-guard`/`forbidden` existentes.
8. **Infra dev** (D11/D12): `infra/sso/podman-compose.yml` + realm import
   (`backoffice`, cliente confidencial PKCE, roles, usuarios de prueba); mismas
   variables de entorno en dev/prod, secretos en el gestor de secretos.

Alcance = **BFF de auth/authz + auditoría enriquecida + wiring de front + infra
de IdP dev**. Quedan **fuera**: nuevas pantallas de gestión de partners (son
`005`), el modelo de persistencia de partners/theme (es `002`), y el editor/preview
(ya en `005`). Esta feature **consume** esas superficies y las protege.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict). **BFF** Node 22+ / Express 5
(`src/server/`, ESM con `.ts` runtime vía `--experimental-strip-types`). **Front**
Angular 20.3 (standalone, zoneless, signals) servido por el mismo SSR de `003`.

**Primary Dependencies**:
- **Nueva (única npm)**: `openid-client` v6 (`/panva/openid-client`) — OIDC
  Code+PKCE server-side (D1).
- **Built-ins reusados**: `node:crypto` (AES-256-GCM sesión + `randomBytes` CSRF),
  `node:sqlite` `DatabaseSync` (filtros de auditoría), `express` (routers).
- **Ya presente en el front**: `@tanstack/angular-query-experimental` (bootstrap
  de sesión), `@ngrx/signals` (`AuthStore`), `@angular/router` (guards),
  `@angular/forms`, Tailwind v4.
- **Consumido de otras features (reuso, no reimplementación)**: puerto
  `AdminAuthGuard` y `admin-router.ts` (`004`/`005`); `PartnerRepository` +
  `audit_log` + `createAuditEntry` transaccional (`002`/`005`); patrón `secrets/`
  (`004`); seams `auth.store`/`auth-guard`/`role-guard`/`forbidden` (`005`).

**Storage**: SQLite (`partners.db`) vía `node:sqlite`, adaptador
`PartnerRepository` existente. Cambios **aditivos** en `audit_log` (columnas
`actor_name`, `theme_version`; índices `actor_sub`, `at`). **Sin session store**
(sesión sellada stateless, D2). Secretos (client_secret, seal key) en el gestor de
secretos, nunca en DB ni bundle.

**Testing**: **Server** — `node --test` (`*.test.ts` junto al fuente,
`npm run test:server`): sellado de sesión, guard de sesión, mapeo de roles,
auth-router (login/callback/session), matriz RBAC+CSRF, filtros e inmutabilidad de
auditoría. **Front** — Karma + Jasmine (`*.spec.ts`, ARCHITECTURE §9): `AuthStore`
(`hasAnyRole`/`roles[]`), `roleGuard` variádico, `AuthApiService`/`AuthQueries`
(`HttpTestingController`), interceptor CSRF. Playwright CLI = verificación manual
del agente del flujo SSO (no CI).

**Target Platform**: BFF Node/Express en `http://localhost:4000` (dev); IdP
RH-SSO 7.6 en contenedor podman (`:8080/:8443`). Front: navegador (SPA hidratada
por SSR), datos mismo-origen tras `/api/*`.

**Project Type**: Aplicación web Angular de proyecto único con **BFF Express +
SSR**. El código nuevo vive en `src/server/` (auth/authz/auditoría) y
`src/app/core/auth` + `src/app/core/interceptors` (front); infra en `infra/sso/`.

**Performance Goals**: Overhead de auth por request admin ≈ desellado AEAD +
comparación CSRF (sub-milisegundo, en proceso, sin I/O). Discovery OIDC cacheado
por `openid-client` (una vez por arranque). Filtros de auditoría en SQL con
índices (no en memoria). Sin metas de throughput específicas (superficie interna
de bajo volumen).

**Constraints**:
- **Token del IdP nunca en el cliente** (FR-002, SC-002): solo cookie
  `bo_session` httpOnly; el access/ID token se valida y descarta server-side.
- **Menor privilegio por defecto** (FR-004, US2 esc.4): sin rol mapeable ⇒ 403.
- **Defensa server-side real** (FR-006): la UI (guards) nunca es la única barrera;
  cada `/api/admin/*` re-verifica sesión+rol.
- **401 vs 403** (FR-007): sin sesión ⇒ 401; sesión sin rol ⇒ 403.
- **Auditoría inmutable y transaccional** (FR-009/010): solo append; misma
  transacción que la mutación (ya garantizado; no se relaja).
- **CSRF** (FR-013): double-submit + SameSite=Strict.
- **Roles desde el IdP en cada login** (FR-014): sin caché larga; `exp` corto.
- **Const. I–IV (front)**: server-state por TanStack Query → `AuthStore`
  síncrono; sin `HttpClient` en componentes/guards; sin axios; standalone+OnPush;
  `inject()`; Tailwind único; zoneless.
- **Paridad dev/prod del IdP**: misma imagen `sso76-openshift-rhel8:7.6`; mismas
  variables de entorno (distintos valores/secretos).

**Scale/Scope**: BFF — 1 router nuevo (`auth-router`), 3 módulos de seguridad
nuevos (sellado de sesión, mapeo de roles, adaptador real de guard), 2 middlewares
(`requireRole`, `requireCsrf`), extensión de `admin-router` (RBAC por endpoint +
actorName), extensión de auditoría (2 columnas, filtros, índices). Front — extensión
de `AuthStore`/`AuthUser`, `roleGuard` variádico, `AuthApiService`+`AuthQueries`
nuevos, 1 interceptor CSRF, wiring en `admin.routes.ts`/`app.config.ts`. Infra —
1 `podman-compose.yml` + 1 realm JSON. **1 dependencia npm nueva** (`openid-client`).

## Constitution Check

*GATE: Debe pasar antes de Phase 0. Re-evaluado tras Phase 1 (ver final).*

La Constitución (I–IV) gobierna la **UI Angular**. Esta feature es
mayoritariamente **BFF Node/Express**, fuera del alcance directo de I–IV (que
hablan de `HttpClient`/NgRx/TanStack/standalone/Tailwind/zoneless del front); el
BFF sigue sus propios patrones ya establecidos en `src/server/` (routers Express,
puertos/adaptadores, `node:sqlite`, `secrets/`). Las **piezas de front** sí se
evalúan contra cada principio:

**I. Estado y Datos — Separación Síncrono/Asíncrono** — ✅ CUMPLE
- **Sin `axios`**: el BFF llama al IdP con `openid-client`; el front usa
  `HttpClient` envuelto en `AuthApiService` (ARCHITECTURE §3).
- **TanStack Query = único estado de servidor en el front**: la sesión (whoami) se
  resuelve con `AuthQueries.session()`/`injectQuery` y se vuelca al `AuthStore` en
  `onSuccess` (patrón login de ARCHITECTURE §3). Ningún componente/guard inyecta
  `HttpClient`.
- **NgRx SignalStore solo síncrono**: `AuthStore` guarda sesión/rol (estado
  síncrono de UI), no datos de API cacheables.

**II. Componentes Standalone y OnPush** — ✅ CUMPLE
- No se añaden componentes de UI nuevos salvo reutilizar `forbidden` (standalone +
  OnPush ya). Guards e interceptor son **funcionales** (`CanActivateFn`/
  `HttpInterceptorFn`), no clases. Sin `ngClass`/`ngStyle`, sin
  `@HostBinding`/`@HostListener`.

**III. Inyección de Dependencias** — ✅ CUMPLE
- `inject()` en guards, interceptor, `AuthApiService`/`AuthQueries`
  (`providedIn:'root'`). Sin inyección por constructor.

**IV. Estilos y Zoneless** — ✅ CUMPLE
- No se introduce CSS/librería nueva (Tailwind único). La reactividad del front es
  por signals + `OnPush`; guards/interceptor no usan `NgZone`/`zone.js`.

**Decisiones nuevas que la Constitución no cubre explícitamente** (detalladas en
`research.md`, ninguna en conflicto con I–IV — todas server-side):
D1 `openid-client` (OIDC), D2 sesión sellada AEAD, D4 CSRF double-submit,
D5 mapeo claim→rol config-driven, D6/D7 RBAC en el puerto existente,
D8/D9 auditoría enriquecida, D11 podman-compose RH-SSO. La **única dependencia
npm nueva** (`openid-client`) es del **BFF**, no del front, y no toca ninguna
prohibición de la Constitución (que aplica al front: no axios, no otra librería
CSS, no `NgModule`, etc.).

**Resultado del gate**: **PASA** sin violaciones. **Complexity Tracking** vacía.

## Project Structure

### Documentation (this feature)

```text
specs/006-authz-roles-auditoria/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Phase 0 — decisiones D1..D12 y alternativas
├── data-model.md        # Phase 1 — entidades server/front, esquema, DTOs
├── quickstart.md        # Phase 1 — validación ejecutable (SSO + roles + auditoría)
├── contracts/           # Phase 1
│   ├── auth-api.contract.md        # /api/auth/* + /api/admin/session (OIDC, sesión) — FR-001/002/003, SC-001/002
│   ├── admin-authz.contract.md     # RBAC server-side + CSRF sobre /api/admin/* — FR-006/007/013, US2
│   ├── audit-api.contract.md       # auditoría enriquecida + filtros — FR-008..012, US3/US4
│   ├── front-authz.contract.md     # guards, bootstrap de sesión, interceptor CSRF — FR-004/006, US1
│   └── dev-idp-infra.contract.md   # podman-compose RH-SSO 7.6 + realm + env — D11/D12
├── checklists/          # (existente) calidad de la spec
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Nuevo BFF de auth/authz en `src/server/security/` y `src/server/api/`; extensión
de auditoría en `src/server/persistence/`; wiring de front en `src/app/core/`;
infra en `infra/sso/`. Se **reutilizan** los seams existentes (puerto
`AdminAuthGuard`, `auth.store`, `role-guard`, `forbidden`, `createAuditEntry`).

```text
src/
  server/
    api/
      auth-router.ts                 # NUEVO — /api/auth/login|callback|logout + /admin/session (auth-api.contract)
      auth-router.test.ts            # NUEVO
      admin-router.ts                # EDITAR — requireRole por endpoint + requireCsrf + actorName (admin-authz.contract)
      admin-authz.test.ts            # NUEVO — matriz RBAC/CSRF 401/403/200
      api-router.ts                  # EDITAR — monta auth-router; pasa deps de sesión/oidc
    security/
      admin-auth-guard.ts            # EDITAR — createSessionAdminAuthGuard (real) + AdminSession.name (D6)
      session-seal.ts                # NUEVO — sellar/desellar AEAD AES-256-GCM (D2)
      session-seal.test.ts           # NUEVO
      csrf.ts                        # NUEVO — emitir/verificar double-submit token (D4)
      csrf.test.ts                   # NUEVO
      role-map.ts                    # NUEVO — claim→AppRole desde config (D5)
      role-map.test.ts               # NUEVO
      require-role.ts                # NUEVO — middleware RBAC (D7)
    oidc/
      oidc-config.ts                 # NUEVO — discovery + Configuration de openid-client (D1/D12)
      oidc-flow.ts                   # NUEVO — buildAuthorizationUrl / authorizationCodeGrant helpers
    persistence/
      audit.ts                       # EDITAR — AuditEntry += actorName, themeVersion; action PRD 06 (D8)
      partner-repository.ts          # EDITAR — AuditQuery += entityId/actorSub/from/to (D9)
      sqlite/schema.ts               # EDITAR — audit_log += columnas + índices (data-model §7)
      sqlite/sqlite-partner-repository.ts  # EDITAR — poblar/filtrar columnas nuevas (D8/D9)
    secrets/                         # (de 004) resuelve OIDC_CLIENT_SECRET / SESSION_SEAL_KEY   [reuso]
  server.ts                          # EDITAR — construir guard real + config OIDC/sesión en la composition root
  app/
    core/
      auth/
        auth-model.ts                # NUEVO — AppRole (unión) + AuthUser (roles[], name)
        auth.store.ts                # EDITAR — roles[]+name, hasAnyRole(...) (front-authz.contract)
        auth.store.spec.ts           # NUEVO
        auth-guard.ts                # (sin cambios de forma)
        role-guard.ts                # EDITAR — variádico roleGuard(...roles) (D10)
        role-guard.spec.ts           # NUEVO
      interceptors/
        csrf-interceptor.ts          # NUEVO — X-CSRF-Token en mutaciones /api/admin/* (D4/D10)
        csrf-interceptor.spec.ts     # NUEVO
    features/auth/                    # NUEVO feature (queries/services de sesión) — o core/auth si se prefiere
      services/auth-api.ts           # NUEVO — AuthApiService: GET /api/admin/session (envuelve HttpClient)
      services/auth-api.spec.ts      # NUEVO — HttpTestingController
      queries/auth-queries.ts        # NUEVO — AuthQueries.session() (queryOptions)
    features/admin/
      admin.routes.ts                # EDITAR — roleGuard('platform-admin','partner-editor','auditor')
      pages/forbidden/forbidden.ts   # (de 005) reutilizado como destino denegado
    app.config.ts                    # EDITAR — provideHttpClient(withInterceptors([csrfInterceptor])); bootstrap de sesión
infra/
  sso/
    podman-compose.yml               # NUEVO — RH-SSO 7.6 (== prod), import de realm (dev-idp-infra.contract)
    realm/backoffice-realm.json      # NUEVO — realm/cliente PKCE/roles/usuarios de prueba
docker-compose.yml                   # (existente) equivalente Docker — se conserva
```

Notas de estructura:
- **El puerto `AdminAuthGuard` no cambia de forma** (D6): `admin-router.ts` sigue
  llamando `guard.authorize({headers})`; solo se le antepone/compone `requireCsrf`
  y `requireRole(...)` por endpoint. Esto minimiza el blast radius.
- **Sesión stateless** (D2): no hay tabla `sessions`; los cambios de `schema.ts`
  se limitan a `audit_log` (aditivos).
- **`openid-client` aislado en `src/server/oidc/`**: el resto del BFF no depende
  directamente de la librería, facilitando tests y sustitución.
- **Front sin manejo de tokens**: `AuthStore` solo refleja `GET /session`; "login"
  es una navegación del browser a `GET /api/auth/login` (server-mediated).

**Structure Decision**: BFF-first para la frontera de seguridad (Node/Express en
`src/server/`, patrón puerto/adaptador ya usado por `AdminAuthGuard`), con
`openid-client` aislado en `oidc/` y sesión/ CSRF/roles en `security/`. La
auditoría se **extiende** sobre el `audit_log` transaccional existente (columnas +
filtros, sin nueva entidad ni relajar inmutabilidad). El front **reutiliza** los
seams `auth.store`/`role-guard`/`forbidden` extendiéndolos mínimamente y resuelve
la sesión por **TanStack Query → `AuthStore`** (Const. I). Infra de IdP en dev por
**podman-compose** con la MISMA imagen de prod. **1 dependencia npm nueva**
(`openid-client`); cero librerías nuevas en el front.

## Complexity Tracking

> Sin violaciones de la Constitución (que gobierna el front; el BFF sigue sus
> patrones establecidos). La única dependencia nueva (`openid-client`) es del BFF
> y está justificada en `research.md` D1 (evita reimplementar OIDC/PKCE/validación
> de firma a mano). Tabla intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Check (tras Phase 1)

Re-evaluado con `data-model.md` y `contracts/` ya definidos:

- **I** — ✅ Confirmado: `front-authz.contract.md` resuelve la sesión con
  `AuthQueries.session()` → `AuthApiService` → `HttpClient` y vuelca a `AuthStore`
  en `onSuccess`; ningún componente/guard toca `HttpClient`. El `AuthStore` guarda
  solo estado síncrono (`data-model.md` §8). Sin axios (el BFF usa `openid-client`).
- **II** — ✅ Confirmado: sin componentes nuevos salvo `forbidden` reutilizado
  (standalone+OnPush). Guards e interceptor **funcionales**.
- **III** — ✅ Confirmado: `inject()` en todo; `AuthApiService`/`AuthQueries`
  `providedIn:'root'`.
- **IV** — ✅ Confirmado: sin CSS/librería nueva; zoneless preservado (signals +
  OnPush, sin `NgZone`).

**Resultado**: **PASA**. El diseño no introduce violaciones. Listo para
`/speckit-tasks`.
</content>
