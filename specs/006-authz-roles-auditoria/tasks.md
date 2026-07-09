---
description: "Task list for AuthZ, Roles y Auditoría (Back Office)"
---

# Tasks: AuthZ, Roles y Auditoría (Back Office)

**Input**: Design documents from `specs/006-authz-roles-auditoria/`

**Prerequisites**: plan.md, spec.md, research.md (D1..D12), data-model.md, contracts/ (auth-api, admin-authz, audit-api, front-authz, dev-idp-infra), quickstart.md

**Tests**: INCLUDED — la spec/quickstart solicita explícitamente tests server (`node --test`, `*.test.ts` junto al fuente, `npm run test:server`) y front (Karma + Jasmine, `*.spec.ts`). Escribe cada test ANTES de su implementación y confirma que falla.

**Organization**: Tareas agrupadas por user story. US1 y US2 son **P1** (MVP conjunto: sin autorización la autenticación no protege nada); US3 es **P2**; US4 es **P3**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1..US4 (solo en fases de historia)
- Rutas de archivo exactas incluidas

## Path Conventions

Proyecto único Angular + BFF Express/SSR. BFF en `src/server/`, front en `src/app/`, infra en `infra/`. Tests server junto al fuente (`*.test.ts`); tests front junto al fuente (`*.spec.ts`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencia OIDC, infra de IdP en dev y configuración de entorno.

- [X] T001 Instalar la única dependencia npm nueva `openid-client` v6 y fijarla en `package.json` (D1): `npm i openid-client`
- [X] T002 [P] Crear `infra/sso/podman-compose.yml` con `registry.redhat.io/rh-sso-7/sso76-openshift-rhel8:7.6`, puertos `8080:8080`/`8443:8443`, volumen de realm con `:z` (SELinux) y volumen `rh-sso-data`, por `contracts/dev-idp-infra.contract.md` §1
- [X] T003 [P] Crear `infra/sso/realm/backoffice-realm.json`: realm `backoffice`, cliente confidencial `backoffice-bff` (Code+PKCE S256, `redirectUris` a `http://localhost:4000/api/auth/callback`), roles de realm `platform-admin`/`partner-editor`/`auditor`, protocol mapper de roles y 4 usuarios de prueba (`admin-user`, `editor-user`, `auditor-user`, `norole-user`), por `contracts/dev-idp-infra.contract.md` §2
- [X] T004 [P] Añadir plantilla de variables de entorno del BFF (`.env.example` en la raíz) con `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_POST_LOGOUT_REDIRECT_URI`, `SESSION_SEAL_KEY`, `SESSION_TTL_SECONDS`, `ROLE_CLAIM_PATH`, `ROLE_MAP`, por `contracts/dev-idp-infra.contract.md` §3
- [X] T005 Extender el resolutor de secretos existente (`src/server/secrets/`) para exponer `OIDC_CLIENT_SECRET` y `SESSION_SEAL_KEY` sin filtrarlos al bundle/cliente (patrón de `004`, FR-002)

**Checkpoint**: IdP dev levantable (`podman-compose -f infra/sso/podman-compose.yml up`), discovery accesible en `{OIDC_ISSUER_URL}/.well-known/openid-configuration`, dependencia y config listas.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Primitivas de seguridad server-side y tipos compartidos que usan US1 y US2. **BLOQUEA todas las historias.**

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta completar esta fase.

- [X] T006 [P] Test `src/server/security/session-seal.test.ts`: sellar/desellar AEAD AES-256-GCM, `exp` vencido ⇒ inválida, payload manipulado ⇒ inválida (D2)
- [X] T007 [P] Implementar `src/server/security/session-seal.ts`: `seal(session)`/`unseal(raw): SealedSession|null` con `node:crypto` AES-256-GCM y `SealedSession {sub,name,roles,iat,exp}` (D2, data-model §2)
- [X] T008 [P] Test `src/server/security/role-map.test.ts`: `claims[roleClaimPath] → ROLE_MAP → dedupe`; sin match ⇒ `[]` (menor privilegio, D5)
- [X] T009 [P] Implementar `src/server/security/role-map.ts`: tipo `AppRole` (`'platform-admin'|'partner-editor'|'auditor'`), `RoleMapConfig` desde entorno y `deriveRoles(claims, config): AppRole[]` (D5, data-model §1/§4)
- [X] T010 [P] Test `src/server/security/csrf.test.ts`: emisión `randomBytes(32).base64url` y verificación double-submit (cookie vs header) match/mismatch/ausencia (D4)
- [X] T011 [P] Implementar `src/server/security/csrf.ts`: `issueCsrfToken()` y `verifyCsrf(cookieValue, headerValue): boolean` (D4, data-model §3)
- [X] T012 Extender `AdminSession` con `name: string` en `src/server/security/admin-auth-guard.ts` (D6, data-model §2) — solo el tipo/puerto, sin cambiar su forma
- [X] T013 [P] Crear `src/app/core/auth/auth-model.ts`: unión `AppRole` (idéntica a §1) + `interface AuthUser { subject; name; roles: readonly AppRole[] }` (data-model §8)

**Checkpoint**: Sellado de sesión, mapeo de roles, CSRF y tipos compartidos disponibles y verdes. Historias pueden empezar.

---

## Phase 3: User Story 1 - Acceso autenticado vía SSO corporativo (Priority: P1) 🎯 MVP

**Goal**: `/admin` sin sesión → redirección al IdP (OIDC Code+PKCE mediado por BFF) → retorno autenticado con cookie `bo_session` httpOnly; el token del IdP nunca llega al navegador.

**Independent Test**: Navegar a `/admin` sin sesión ⇒ 302 al IdP; autenticarse como `editor-user` ⇒ vuelve autenticado; DevTools muestra solo `bo_session` httpOnly (+ `csrf`), sin access/ID token (SC-001, SC-002); expirar sesión ⇒ 401 y reenvío a login (SC-004).

### Tests for User Story 1 ⚠️ (escribir primero, deben fallar)

- [X] T014 [P] [US1] Test `src/server/security/session-admin-auth-guard.test.ts`: cookie `bo_session` válida ⇒ `AdminSession{subject,name,roles}`; ausente/expirada/inválida ⇒ `throw` (→401) (D6, admin-authz.contract §1)
- [X] T015 [P] [US1] Test `src/server/api/auth-router.test.ts`: `GET /login` ⇒ 302 al `authorization_endpoint` + cookie `bo_oidc_tx`; `GET /callback` emite `bo_session`+`csrf` y **descarta** el token del IdP; `GET /admin/session` ⇒ 200 con `{subject,name,roles}` o 401; `POST /logout` borra cookies (auth-api.contract)
- [X] T016 [P] [US1] Test `src/app/core/auth/auth.store.spec.ts`: `setUser`, `isAuthenticated`, `hasAnyRole(...)` con `roles[]` (front-authz.contract §1)
- [X] T017 [P] [US1] Test `src/app/core/auth/auth-api.spec.ts` y `auth-queries.spec.ts`: `getSession()` → `GET /api/admin/session` con `HttpTestingController`; `onSuccess` → `AuthStore.setUser` (front-authz.contract §4)

### Implementation for User Story 1

- [X] T018 [P] [US1] Implementar `src/server/oidc/oidc-config.ts`: discovery + `Configuration` de `openid-client` v6 desde env (issuer con base `/auth` de RH-SSO 7.6), cacheado por arranque (D1/D12)
- [X] T019 [P] [US1] Implementar `src/server/oidc/oidc-flow.ts`: helpers `buildAuthorizationUrl` (PKCE S256, `state`/`nonce`) y `authorizationCodeGrant` (valida firma JWKS/`iss`/`aud`/`exp`/`nonce`) (D1, FR-003)
- [X] T020 [US1] Implementar `createSessionAdminAuthGuard({ unseal, now })` en `src/server/security/admin-auth-guard.ts`: extrae `bo_session` de `Cookie`, desella, valida `exp`, retorna `AdminSession` o lanza (D6, admin-authz.contract §1) — depende de T007, T012
- [X] T021 [US1] Implementar `src/server/api/auth-router.ts` (`GET /api/auth/login`, `GET /api/auth/callback`, `GET /api/admin/session`, `POST /api/auth/logout`): cookie tx `bo_oidc_tx`, emisión de `bo_session` sellada + `csrf`, derivación de roles, descarte del token IdP, fallo seguro (302 `/forbidden`) si IdP/validación falla; usa `createApiError`/`httpStatusForCode` (auth-api.contract) — depende de T007, T009, T011, T018, T019
- [X] T022 [US1] Montar `auth-router` en `src/server/api/api-router.ts` (antes/junto a `/admin`) pasando deps de sesión/OIDC/CSRF
- [X] T023 [US1] Construir el guard real (`createSessionAdminAuthGuard`) y la config OIDC/sesión en la composition root `src/server.ts`, reemplazando el default-deny V1 (D6)
- [X] T024 [P] [US1] Extender `src/app/core/auth/auth.store.ts`: `AuthUser` con `name`+`roles[]`, `setUser`, `isAuthenticated` (existente) y `hasAnyRole(...roles): boolean` (D10, front-authz.contract §1) — depende de T013
- [X] T025 [P] [US1] Crear `src/app/features/auth/services/auth-api.ts` (`AuthApiService.getSession()` → `GET /api/admin/session`, `providedIn:'root'`, envuelve `HttpClient`) y `src/app/features/auth/queries/auth-queries.ts` (`AuthQueries.session()` → `queryOptions(['auth','session'])`) (Const. I, front-authz.contract §4)
- [X] T026 [US1] Bootstrap de sesión: `injectQuery(AuthQueries.session())` en la raíz/initializer, `onSuccess` → `AuthStore.setUser(dto)`; en `401` disparar login (`window.location` → `/api/auth/login?returnTo=<ruta>`) (front-authz.contract §4/§5) — depende de T024, T025
- [X] T027 [US1] Cablear `authGuard` en `src/app/features/admin/admin.routes.ts` (exige `AuthStore.isAuthenticated()`, si no → `/forbidden`/login) (front-authz.contract §2)

**Checkpoint**: Login SSO end-to-end funcional; sesión httpOnly; sin tokens en el cliente; 401 reenvía a login. **MVP demostrable junto con US2.**

---

## Phase 4: User Story 2 - Autorización por roles con menor privilegio (Priority: P1)

**Goal**: Cada `/api/admin/*` se autoriza server-side por rol (401 sin sesión, 403 sin rol), con protección CSRF en mutaciones y guards de front como UX; menor privilegio por defecto.

**Independent Test**: `auditor-user` ve `GET /partners`/`/audit` (200) pero recibe 403 en cualquier `POST/PATCH` sin efecto (SC-003); `norole-user` recibe 403 en todo `/admin/*` (SC-004); mutación sin `X-CSRF-Token` válido ⇒ 403; `curl` directo confirma que la UI no es la única barrera.

### Tests for User Story 2 ⚠️ (escribir primero, deben fallar)

- [X] T028 [P] [US2] Test `src/server/api/admin-authz.test.ts`: matriz completa (admin-authz.contract §2) — sin `bo_session` ⇒ 401; `auditor` en `POST/PATCH` ⇒ 403 sin efecto; rol `[]`/desconocido ⇒ 403; mutación sin `X-CSRF-Token` válido ⇒ 403; roles permitidos ⇒ 200/201
- [X] T029 [P] [US2] Test `src/app/core/auth/role-guard.spec.ts`: `roleGuard(...roles)` variádico permite si `hasAnyRole` y deniega → `/forbidden` (front-authz.contract §3)
- [X] T030 [P] [US2] Test `src/app/core/interceptors/csrf-interceptor.spec.ts`: añade `X-CSRF-Token` (de cookie `csrf`) en `POST/PATCH/PUT/DELETE` hacia `/api/admin/*`; GET sin cambios (front-authz.contract §6)

### Implementation for User Story 2

- [X] T031 [P] [US2] Implementar middleware `src/server/security/require-role.ts`: `requireRole(...roles: AppRole[]): RequestHandler` ⇒ 403 si la sesión no incluye ninguno (D7, admin-authz.contract §2) — depende de T009
- [X] T032 [P] [US2] Implementar middleware `requireCsrf` (en `src/server/security/csrf.ts` o `require-csrf.ts`): sobre `POST/PATCH` de `/api/admin/*`, compara cookie `csrf` vs header `X-CSRF-Token` ⇒ 403 en mismatch/ausencia (D4, admin-authz.contract §3) — depende de T011
- [X] T033 [US2] Editar `src/server/api/admin-router.ts`: aplicar el orden `requireAdminSession → requireCsrf (mutaciones) → requireRole(...) → handler` y la matriz por endpoint de admin-authz.contract §2 (partners GET = 3 roles; audit GET = admin/auditor; mutaciones = admin/editor) — depende de T031, T032
- [X] T034 [US2] Editar `src/app/core/auth/role-guard.ts` a variádico `roleGuard(...roles: AppRole[]): CanActivateFn` usando `AuthStore.hasAnyRole` → `/forbidden` (D10, front-authz.contract §3) — depende de T024
- [X] T035 [US2] Implementar `src/app/core/interceptors/csrf-interceptor.ts` (`HttpInterceptorFn`, funcional, `inject()`) que añade `X-CSRF-Token` en mutaciones `/api/admin/*` y registrarlo en `src/app/app.config.ts` vía `provideHttpClient(withInterceptors([csrfInterceptor]))` (D4/D10, front-authz.contract §6)
- [X] T036 [US2] Aplicar `roleGuard('platform-admin','partner-editor','auditor')` en `src/app/features/admin/admin.routes.ts` sobre el layout admin (front-authz.contract §3) — depende de T034

**Checkpoint**: RBAC+CSRF server-side efectivo (401/403/200 por matriz); guards de front alineados. **US1+US2 = MVP de seguridad completo.**

---

## Phase 5: User Story 3 - Registro de auditoría inmutable de mutaciones (Priority: P2)

**Goal**: Cada mutación genera exactamente una entrada de auditoría inmutable y transaccional con actor técnico+legible, acción, fecha, diff y `themeVersion` cuando aplique.

**Independent Test**: `editor-user` publica branding ⇒ `GET /audit` muestra 1 entrada con `actorSub`, `actorName`, `action:'publish'`, `at`, `diff` y `themeVersion` (SC-005); no existe ruta/método de UPDATE/DELETE (SC-006); mutación fallida ⇒ sin entrada inconsistente (misma transacción).

### Tests for User Story 3 ⚠️ (escribir primero, deben fallar)

- [X] T037 [P] [US3] Test de auditoría (persistencia) junto al adaptador `src/server/persistence/sqlite/sqlite-partner-repository.test.ts` (o `audit.test.ts`): cada mutación ⇒ 1 entrada con `actorName`/`themeVersion`/`diff` correctos (SC-005); intento de UPDATE/DELETE ⇒ imposible (SC-006); mutación revertida ⇒ sin entrada (FR-010)

### Implementation for User Story 3

- [X] T038 [US3] Editar `src/server/persistence/sqlite/schema.ts`: `ALTER TABLE audit_log ADD COLUMN actor_name TEXT` y `ADD COLUMN theme_version INTEGER` (guardas tolerantes a "duplicate column"); ampliar `CHECK(action)` a `('create','update','publish','deactivate','activate')`; `CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_sub)` e `idx_audit_at ON audit_log(at)` (data-model §7)
- [X] T039 [US3] Editar `src/server/persistence/audit.ts`: `AuditEntry` += `actorName: string`, `themeVersion?: number`; tipo `AuditDiff = Record<string,{from,to}>`; vocabulario `AuditAction` PRD 06 con mapeo `save_version → update` (D8, data-model §5)
- [X] T040 [US3] Editar `src/server/persistence/sqlite/sqlite-partner-repository.ts`: `createAuditEntry` persiste `actor_name`/`theme_version` en la MISMA transacción de la mutación; mantener append-only (sin UPDATE/DELETE) (audit-api.contract §1, FR-009/010) — depende de T038, T039
- [X] T041 [US3] Editar los handlers de mutación en `src/server/api/admin-router.ts` para pasar `actorName: req.adminSession.name` y, cuando aplique, `themeVersion`/`diff` por acción (create/update/publish/deactivate/activate) según audit-api.contract §2 (D8, FR-008/FR-012) — depende de T040, T033

**Checkpoint**: Toda mutación audita actor legible + versión; inmutabilidad y transaccionalidad verificadas.

---

## Phase 6: User Story 4 - Consulta de auditoría con filtros (Priority: P3)

**Goal**: `auditor`/`platform-admin` consultan la auditoría filtrando por partner, actor y rango de fechas; se puede reconstruir la versión de marca vigente en una fecha.

**Independent Test**: `GET /audit?partnerId=` ⇒ solo ese partner; `?actor=&from=&to=` ⇒ intersección AND (SC-007); `partner-editor` ⇒ 403 en `/audit`; `?partnerId=&action=publish&to=` primer resultado da `themeVersion` vigente (SC-008).

### Tests for User Story 4 ⚠️ (escribir primero, deben fallar)

- [X] T042 [P] [US4] Test de filtros en `src/server/persistence/sqlite/sqlite-partner-repository.test.ts` (o `audit-query.test.ts`): filtros `entityId`/`actorSub`/`from`/`to` combinan con AND, orden `at DESC`; reconstrucción "marca vigente en fecha X" unívoca (SC-007, SC-008, audit-api.contract §3/§4)

### Implementation for User Story 4

- [X] T043 [US4] Editar `AuditQuery` en `src/server/persistence/partner-repository.ts`: += `entityId?`, `actorSub?`, `from?`, `to?` (data-model §6, D9)
- [X] T044 [US4] Editar `listAuditLog` en `src/server/persistence/sqlite/sqlite-partner-repository.ts`: aplicar filtros en SQL con AND usando índices `idx_audit_entity`/`idx_audit_actor`/`idx_audit_at`, orden `at DESC` (audit-api.contract §3) — depende de T043, T038
- [X] T045 [US4] Exponer query params en `GET /api/admin/audit` de `src/server/api/admin-router.ts` (`partnerId`/`entityId`, `actor`/`actorSub`, `from`, `to`, `limit`, `offset`), restringido a `auditor`/`platform-admin` (403 en otro caso) (audit-api.contract §3, FR-011) — depende de T044, T033

**Checkpoint**: Consulta filtrable de auditoría operativa y restringida por rol; reconstrucción por fecha disponible.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validación end-to-end y endurecimiento transversal.

- [X] T046 [P] Ejecutar la suite server (`npm run test:server`) y front (Karma) completas; confirmar verde
- [X] T047 [P] Verificación manual del flujo SSO (curl con cookie jar, Playwright CLI no disponible en esta sesión) con los 4 usuarios de prueba contra RH-SSO real vía podman — ver notas
- [X] T048 Checklist de `quickstart.md` (SC-001..SC-005) verificado end-to-end contra el IdP podman real (login, sesión httpOnly, RBAC 401/403, CSRF, auditoría enriquecida)
- [X] T049 [P] Endurecimiento de cookies para prod (`Secure` sobre TLS, `SameSite=Strict`) y documentación de paridad dev/prod en `infra/sso/README.md`

**Notas de T047/T048 (verificación manual real, no simulada)**:
- El Playwright CLI/MCP no estaba disponible en esta sesión; se condujo el flujo
  OIDC completo con `curl` + cookie jar (login → form de RH-SSO → callback →
  `bo_session` httpOnly + `csrf`) contra un RH-SSO 7.6 real vía podman.
- **Bug real encontrado y corregido durante esta verificación**: `openid-client`
  v6 rechaza por defecto discovery/requests a issuers no-HTTPS
  (`OAUTH_HTTP_REQUEST_FORBIDDEN`), lo que rompía todo el flujo contra el IdP
  de dev en `http://localhost:8080`. Corregido en `src/server/oidc/oidc-config.ts`
  aplicando `client.allowInsecureRequests` solo cuando `issuerUrl` no es HTTPS
  (dev), preservando el comportamiento estricto en prod.
- Verificado con los 4 usuarios reales (`admin-user`/`editor-user`/`auditor-user`/
  `norole-user`): roles derivados correctamente vía `ROLE_MAP`, `GET /admin/session`
  devuelve `{subject,name,roles}` sin token del IdP.
- Verificada la matriz RBAC+CSRF contra el servidor real: sin sesión ⇒ 401;
  `auditor` en `POST /partners` ⇒ 403; `norole-user` ⇒ 403 en todo `/admin/*`;
  mutación sin `X-CSRF-Token` ⇒ 403; `partner-editor` con CSRF válido ⇒ 201.
- Verificada la auditoría enriquecida real: la entrada de `create` generada por
  `editor-user` registra `actorName:"Editor User"` y el `diff` estructurado.
- **Incidente operativo durante la verificación**: un contenedor `rh-sso`
  preexistente del usuario (no creado en esta sesión) fue eliminado
  inadvertidamente por un intento fallido de `podman-compose up` (conflicto de
  nombre). Se recreó con el usuario informado y autorizando explícitamente;
  el volumen `rh-sso-data` había persistido, por lo que el realm `backoffice`
  sobrevivió. Se corrigió además `infra/sso/podman-compose.yml` (el `command:`
  con `-Dkeycloak.import` no es compatible con el entrypoint de esta imagen
  bajo podman-compose) y se documentó el import vía REST API en
  `infra/sso/import-realm.sh` + `infra/sso/README.md`.
- SC-006 (append-only, imposibilidad de UPDATE/DELETE) y SC-007/SC-008
  (filtros de auditoría, reconstrucción por fecha) se validaron por los tests
  automatizados de `sqlite-partner-repository.test.ts` (T037/T042), no
  repetidos manualmente por ser equivalentes y ya verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — empieza de inmediato
- **Foundational (Phase 2)**: depende de Setup — **BLOQUEA todas las historias**
- **US1 (Phase 3)** y **US2 (Phase 4)**: dependen de Foundational; ambas P1 forman el MVP. Comparten `admin-router`/`app.config`, por lo que US2 se integra sobre US1 (recomendado secuencial US1→US2; el guard real de US1 habilita el 401 que US2 asume)
- **US3 (Phase 5)**: depende de Foundational; requiere el `actorName` de la sesión real (US1) y los handlers con RBAC (US2) para el actor de auditoría
- **US4 (Phase 6)**: depende de US3 (columnas/índices y entradas enriquecidas)
- **Polish (Phase 7)**: depende de las historias deseadas

### Within Each User Story

- Tests escritos y en rojo antes de implementar
- Server: primitivas (Fase 2) → oidc/guard → router → wiring en `server.ts`/`api-router.ts`
- Front: tipos → store → services/queries → guards/interceptor → wiring en `admin.routes.ts`/`app.config.ts`

### Parallel Opportunities

- Setup: T002, T003, T004 en paralelo (infra + env)
- Foundational: T006/T007, T008/T009, T010/T011 y T013 en paralelo (módulos distintos); T012 independiente
- US1: tests T014–T017 en paralelo; T018/T019 (oidc) en paralelo; front T024/T025 en paralelo con server
- US2: tests T028–T030 en paralelo; T031/T032 (middlewares) en paralelo
- Historias por prioridad: US3 y US4 no son paralelas entre sí (US4 depende de US3)

---

## Parallel Example: User Story 1

```bash
# Tests US1 juntos (deben fallar primero):
Task: "Test session-admin-auth-guard en src/server/security/session-admin-auth-guard.test.ts"
Task: "Test auth-router en src/server/api/auth-router.test.ts"
Task: "Test auth.store en src/app/core/auth/auth.store.spec.ts"
Task: "Test auth-api/auth-queries en src/app/core/auth/*.spec.ts"

# OIDC helpers en paralelo:
Task: "oidc-config en src/server/oidc/oidc-config.ts"
Task: "oidc-flow en src/server/oidc/oidc-flow.ts"
```

---

## Implementation Strategy

### MVP (US1 + US2 — ambas P1)

1. Fase 1 Setup → Fase 2 Foundational (crítico)
2. Fase 3 US1 (login SSO, sesión httpOnly, whoami)
3. Fase 4 US2 (RBAC+CSRF server-side, guards front)
4. **PARAR y VALIDAR**: `/admin` protegido end-to-end (SC-001..SC-004) con los 4 usuarios
5. Demo del MVP de seguridad

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → login seguro (validar) → demo
3. US2 → autorización efectiva (validar) → demo
4. US3 → auditoría enriquecida inmutable (validar) → demo
5. US4 → consulta filtrable (validar) → demo

---

## Notes

- Tests requeridos por la spec (server `node --test`, front Karma) — escribir en rojo antes de implementar
- `[P]` = archivos distintos, sin dependencias pendientes
- El puerto `AdminAuthGuard` **no cambia de forma** (D6): minimiza blast radius en `admin-router.ts`
- Sesión **stateless** (D2): sin tabla `sessions`; los cambios de `schema.ts` se limitan a `audit_log` (aditivos)
- `openid-client` aislado en `src/server/oidc/`; front sin manejo de tokens (login = navegación a `/api/auth/login`)
- Commit tras cada tarea o grupo lógico; parar en cada checkpoint para validar la historia
</content>
</invoke>
