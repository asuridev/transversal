---
description: "Task list for feature 008 — Login Externo (webview-login) y Transferencia de Sesión SSO"
---

# Tasks: Login Externo (webview-login) y Transferencia de Sesión SSO al Transversal

**Input**: Design documents from `specs/008-login-externo-transferencia-sesion/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D6), data-model.md, contracts/ (auth-login-module, realm-second-client, theme-cors, webview-login-consumption)

**Tests**: INCLUIDOS. El proyecto (006/007) ships pruebas de contrato + unidad y los contratos definen criterios `CT-xx`; se generan tareas de test por historia.

**Organization**: Tareas agrupadas por user story (US1 P1, US2 P2, US3 P3). Todo el código de este repo es server-side (BFF) + un ajuste de front; la implementación de webview-login vive en el repo hermano y se lista como **track externo** (sin T-IDs de este repo).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational y Polish no llevan etiqueta)

## Path Conventions

Web app con BFF: front en `src/app/`, server en `src/server/`, config SSO en `infra/sso/`. Rutas exactas en cada tarea.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuración de entorno y del segundo cliente SSO — prerequisito de todo el flujo.

- [X] T001 [P] Añadir variables de entorno `WEBVIEW_LOGIN_ORIGIN` (allowlist CORS) y `WEBVIEW_LOGIN_URL` (post-logout + redirección de front) a la resolución de secretos/env en `src/server.ts` (y `src/server/secrets/oidc-secrets.ts` si aplica), y `webviewLoginUrl` a `src/environments/environment.ts` y `src/environments/environment.development.ts`.
- [X] T002 [P] Registrar el cliente OIDC `webview-login` en `infra/sso/realm/backoffice-realm.json` (`standardFlowEnabled`, `redirectUris`/`webOrigins` del dominio A, mappers `realm-roles` + `partner-claim` replicados, `pkce.code.challenge.method=S256`) y añadir `post.logout.redirect.uris`=URL base de webview-login al cliente `backoffice-bff`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Catálogo de módulos server-side, usado por el callback (US1) y la navegación por card (US3).

**⚠️ CRITICAL**: Debe completarse antes de US1 y US3.

- [X] T003 Crear `src/server/security/module-catalog.ts` con el tipo `ModuleCatalogEntry` (`moduleId`, `route`, `requiredRoles?`, `requiresPartner?`) y la función pura `resolveModuleRoute(moduleId, { roles, hasPartner }): string | null` (existencia + intersección de roles + `requiresPartner`, `route` saneada con el criterio de `safeReturnTo`).
- [X] T004 [P] Pruebas unitarias de `resolveModuleRoute` (módulo inexistente→null, roles sin intersección→null, `requiresPartner` sin partner→null, éxito→ruta saneada) en `src/server/security/module-catalog.spec.ts`.

**Checkpoint**: Catálogo listo — US1 y US3 pueden proceder.

---

## Phase 3: User Story 1 - Login externo con transferencia de sesión (Priority: P1) 🎯 MVP

**Goal**: El usuario entra por webview-login y aterriza en la transversal autenticado (silent SSO), con `bo_session` sellada y partner derivado del claim, sin re-credenciales; logout único de reino.

**Independent Test**: Autenticar en webview-login (o simular sesión de realm) y verificar que `GET /api/auth/login?module=<id>` completa sin prompt y `GET /api/admin/session` devuelve la sesión con `partnerSlug`; `POST /auth/logout` termina la sesión del realm.

### Tests for User Story 1 ⚠️

- [X] T005 [P] [US1] Pruebas de contrato `auth-login-module` (CT-01 destino por módulo, CT-02 fallback módulo inexistente, CT-05 sin `bo_oidc_tx`→/forbidden, CT-06 fallo de intercambio→sin sesión, CT-07 ningún token en cookies/cuerpo, CT-08 sin params→/admin) en `src/server/api/auth-router.spec.ts`.
- [X] T006 [P] [US1] Pruebas de contrato `realm-second-client` para logout (CT-11 expira cookies + URL de `end_session_endpoint` con `post_logout_redirect_uri`, CT-12 no re-establece sesión) en `src/server/api/auth-router.spec.ts`.

### Implementation for User Story 1

- [X] T007 [US1] Extender `TxPayload` con `moduleId?` y modificar `GET /auth/login` para aceptar `?module`, validar existencia en el catálogo y sellar `moduleId` (o `safeReturnTo` legacy) en `bo_oidc_tx`, en `src/server/api/auth-router.ts`.
- [X] T008 [US1] Modificar `GET /auth/callback` para resolver la ruta destino con `resolveModuleRoute(moduleId, { roles, hasPartner: partnerSlug !== undefined })`, con fallback a `DEFAULT_RETURN_TO` cuando devuelva `null`, manteniendo el sellado de `bo_session`/`csrf` y el fail-secure, en `src/server/api/auth-router.ts`.
- [X] T009 [US1] Añadir `buildEndSessionUrl(config, { postLogoutRedirectUri, idTokenHint? })` en `src/server/oidc/oidc-flow.ts` (envuelve `client.buildEndSessionUrl`) y exponer `endSession` + `postLogoutRedirectUri` en `AuthRouterDeps` cableado desde `src/server.ts`.
- [X] T010 [US1] Reescribir `POST /auth/logout` para, tras verificar CSRF y expirar `bo_session`/`csrf`, devolver/`302` a la URL de `end_session_endpoint` con `post_logout_redirect_uri`=webview-login (fail-safe: expirar cookies aunque el end-session no esté disponible), en `src/server/api/auth-router.ts`.
- [X] T011 [P] [US1] Front: cuando no haya sesión (401 de sesión / guard sin `isAuthenticated`), redirigir el navegador a `environment.webviewLoginUrl` en vez de `/forbidden`, distinguiendo "sin sesión" de "autenticado sin permiso", en `src/app/core/auth/auth-guard.ts` y el interceptor/initializer correspondiente en `src/app/core/auth/`.
- [X] T012 [P] [US1] Prueba de front (Karma/Jasmine) del guard/interceptor: 401/sin sesión ⇒ redirección a `webviewLoginUrl`; autenticado-sin-permiso ⇒ `/forbidden`, en `src/app/core/auth/auth-guard.spec.ts`.

**Checkpoint**: US1 funcional — handoff + logout de reino verificables de forma independiente (MVP).

---

## Phase 4: User Story 2 - Página modular con el tema del partner (Priority: P2)

**Goal**: La transversal expone el tema del partner cross-origin para que webview-login lo renderice; fallback neutro cuando no aplica. (El render vive en webview-login — track externo.)

**Independent Test**: `GET /api/theme/:slug` desde el `Origin` de webview-login devuelve `PublicTheme` con cabeceras CORS correctas; origen no permitido no recibe cabeceras CORS.

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] Pruebas de contrato `theme-cors` (CT-20 origen permitido→`Access-Control-Allow-Origin`+`Vary`, CT-21 preflight OPTIONS→204, CT-22 origen no permitido→sin CORS, CT-23 `PublicTheme` sanitizado + ETag, CT-24 fallback neutro, CT-25 sin credenciales) en `src/server/api/public-router.spec.ts`.

### Implementation for User Story 2

- [X] T014 [US2] Crear `src/server/security/cors.ts`: `createCorsMiddleware({ allowedOrigins })` zero-dependencia (eco de `Origin` permitido, `Vary: Origin`, preflight `OPTIONS`→204 con `Allow-Methods: GET, OPTIONS` y `Allow-Headers: If-None-Match`; sin `Allow-Credentials`).
- [X] T015 [US2] Aplicar el middleware CORS solo a `GET /theme/:slug` y `GET /partners/active` en `src/server/api/public-router.ts` (o al montarlo en `src/server/api/api-router.ts`), cableando `allowedOrigins` desde `WEBVIEW_LOGIN_ORIGIN`; conservar `Cache-Control`/`ETag`/`304`.
- [X] T016 [P] [US2] Pruebas unitarias del middleware CORS (permitido / bloqueado / preflight) en `src/server/security/cors.spec.ts`.

**Checkpoint**: US2 funcional — tema consumible cross-origin por webview-login; independiente de US1.

---

## Phase 5: User Story 3 - Navegación por card al módulo (Priority: P3)

**Goal**: Cada card (por `moduleId`) aterriza en el módulo correcto de la transversal, con disponibilidad por rol/partner; identificadores no disponibles → fallback.

**Independent Test**: Con distintos `moduleId` (válido, inexistente, `requiresPartner` sin partner, `requiredRoles` sin intersección) verificar la ruta resuelta o el fallback en el callback.

### Tests for User Story 3 ⚠️

- [X] T017 [P] [US3] Pruebas de contrato `auth-login-module` de disponibilidad (CT-03 `requiresPartner` con admin→fallback, CT-04 `requiredRoles` sin intersección→fallback) y de la resolución de navegación, en `src/server/api/auth-router.spec.ts`.

### Implementation for User Story 3

- [X] T018 [US3] Poblar el catálogo con las entradas reales de los módulos del journey (`moduleId → route`, `requiredRoles`/`requiresPartner` según cada módulo) en `src/server/security/module-catalog.ts`.
- [X] T019 [US3] Verificar/afinar en `GET /auth/callback` el rechazo de `moduleId` no disponible con fallback (sin ruta arbitraria), reutilizando `resolveModuleRoute`, en `src/server/api/auth-router.ts`.

**Checkpoint**: Las tres historias funcionan de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 [P] Actualizar `documentation/autenticacion-autorizacion.md` con el login externo, el handoff silent-SSO, el catálogo de módulos, el CORS del tema y el logout único de reino.
- [X] T021 [P] Añadir en el repo hermano `C:\sofka\bnp\webview-login` un puntero/README al contrato `contracts/webview-login-consumption.contract.md` (track externo) para alinear su implementación.
- [X] T022 Ejecutar la validación end-to-end de `quickstart.md` (escenarios 1–5; Playwright opcional para el flujo visual) y confirmar SC-001/002/003/004/005/006.
- [X] T023 Regresión: correr las suites de 006/007 (aislamiento por partner, auditoría, roles) para confirmar que el comportamiento post-aterrizaje no cambia (SC-007).

---

## Track Externo (repo `C:\sofka\bnp\webview-login`) — sin T-IDs de este repo

Gobernado por `contracts/webview-login-consumption.contract.md` y la misma constitución (standalone + OnPush + signals, `inject()`, TanStack Query, Tailwind v4, zoneless, sin axios):

- Login OIDC contra el cliente `webview-login` del realm.
- Derivar el partner del propio token (claim `partner`, cardinalidad exactamente-uno).
- Consumir `GET https://<transversal>/api/theme/<slug>` (CORS) y aplicar `--brand-*` (reutilizar `toCssVars` + bloque `@theme`/`:root`); fallback neutro.
- Página modular de cards (Figma node 12286-272780); cada botón → `GET https://<transversal>/api/auth/login?module=<moduleId>`.
- Ser el `post_logout_redirect_uri` del logout de la transversal.
- Validables end-to-end con CT-30…CT-34.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup (env + realm). Bloquea US1 y US3.
- **User Stories (Phase 3+)**: dependen de Foundational.
  - US2 (tema/CORS) es independiente de US1/US3 y del catálogo — solo depende de Setup (env CORS).
  - US1 y US3 dependen del catálogo (T003).
- **Polish (Phase 6)**: tras completar las historias deseadas.

### User Story Dependencies

- **US1 (P1)**: tras Foundational. Núcleo del handoff; no depende de otras historias.
- **US2 (P2)**: tras Setup (solo `WEBVIEW_LOGIN_ORIGIN`). Independiente de US1/US3.
- **US3 (P3)**: tras Foundational; reutiliza el callback de US1 (T008) para la resolución — poblar catálogo (T018) es independiente, pero la verificación (T019) asume T008.

### Within Each User Story

- Tests primero (deben fallar antes de implementar).
- `oidc-flow`/helpers antes de los handlers del router.
- Catálogo (Foundational) antes de la resolución en el callback.

### Parallel Opportunities

- Setup: T001 y T002 en paralelo.
- Foundational: T004 en paralelo con la escritura de T003 una vez definido el tipo.
- US1: T005/T006 (tests) en paralelo; T011/T012 (front) en paralelo con el server (T007–T010) por ser archivos distintos.
- US2 es totalmente paralelizable con US1 (archivos distintos: `cors.ts`/`public-router.ts` vs `auth-router.ts`).
- Polish: T020 y T021 en paralelo.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 juntos:
Task: "Contract tests auth-login-module (CT-01..08) en src/server/api/auth-router.spec.ts"
Task: "Contract tests logout de reino (CT-11/12) en src/server/api/auth-router.spec.ts"

# Front en paralelo con el server:
Task: "Guard/interceptor redirige a webviewLoginUrl sin sesión (src/app/core/auth/)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup (env + 2º cliente SSO).
2. Phase 2 Foundational (catálogo de módulos).
3. Phase 3 US1 (handoff silent-SSO + logout de reino).
4. **STOP y VALIDAR**: un usuario entra por webview-login (o sesión de realm simulada) y aterriza autenticado; logout cierra el realm.
5. Demo del MVP.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 → handoff (MVP) → demo.
3. US2 → tema cross-origin (CORS) → demo (con webview-login consumiendo el tema).
4. US3 → catálogo real de módulos + navegación → demo.
5. Polish → doc, quickstart, regresión 006/007.

### Parallel Team Strategy

- Dev A: US1 (server auth-router + oidc-flow) + front redirect.
- Dev B: US2 (cors + public-router) — independiente.
- Dev C: catálogo (Foundational) → US3 entries.
- Repo hermano: equipo webview-login sobre el contrato de consumo.

---

## Notes

- [P] = archivos distintos, sin dependencias.
- **Cero dependencias npm nuevas** (CORS y catálogo propios; `buildEndSessionUrl` de `openid-client` ya presente).
- Verificar que los tests fallan antes de implementar; commit por tarea o grupo lógico.
- No romper el comportamiento post-aterrizaje de 006/007 (SC-007) ni exponer tokens del IdP (SC-003).
