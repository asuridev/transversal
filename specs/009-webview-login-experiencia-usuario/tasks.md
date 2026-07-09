---

description: "Task list for feature implementation"
---

# Tasks: Experiencia de Usuario de Login Externo (webview-login)

**Input**: Design documents from `specs/009-webview-login-experiencia-usuario/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/webview-login-routing.contract.md, quickstart.md

**Tests**: No solicitados explícitamente en la spec ni por el usuario — no se generan tareas de test dedicadas; la validación end-to-end se hace vía `quickstart.md` (tarea de Polish).

**Repo objetivo de estas tareas**: `C:\sofka\bnp\webview-login` (repo hermano, no `transversal`) — todos los paths de archivo abajo son relativos a esa raíz.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: A qué user story de `spec.md` pertenece (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar el proyecto (hoy scaffold vacío) para recibir el flujo de auth.

- [X] T001 Crear `src/environments/environment.ts` y `src/environments/environment.development.ts` con `idpAuthorizationEndpoint`, `idpTokenEndpoint`, `idpEndSessionEndpoint`, `oidcClientId` (`webview-login`) y `transversalBaseUrl`
- [X] T002 [P] Configurar `fileReplacements` en `angular.json` (`architect.build.configurations.development`) para `environment.development.ts`, siguiendo la convención de `transversal/.claude/ARCHITECTURE.md` §8
- [X] T003 [P] Crear la carpeta `src/app/core/auth/` y `src/app/features/login/` y `src/app/features/advisor-cards/` vacías (estructura per plan.md)

**Checkpoint**: proyecto listo para recibir la lógica de auth (Fase 2).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura de auth compartida por las tres user stories — nada de Fase 3+ puede empezar antes.

**⚠️ CRITICAL**: ninguna user story puede implementarse sin esto.

- [X] T004 [P] Crear `AuthClaims` model y función pura de derivación (`deriveIsAdmin(roles)`) en `src/app/core/auth/auth-claims-model.ts` (data-model.md § AuthClaims)
- [X] T005 [P] Implementar utilidades PKCE (`generateCodeVerifier`, `generateCodeChallengeS256`, `generateState`, `generateNonce`) con `crypto.subtle` en `src/app/core/auth/pkce.ts` (research.md R1 — sin librería externa)
- [X] T006 [P] Implementar `PkceTransaction` (guardar/leer/borrar `codeVerifier`/`state`/`nonce` en `sessionStorage`) en `src/app/core/auth/pkce-transaction.ts` (data-model.md § PkceTransaction)
- [X] T007 Implementar `oidc-client.ts` en `src/app/core/auth/oidc-client.ts`: `buildAuthorizationUrl(pkce)` (contra `environment.idpAuthorizationEndpoint`, `client_id=webview-login`, `response_type=code`, `code_challenge_method=S256`) y `exchangeCode(code, codeVerifier)` (POST a `environment.idpTokenEndpoint` vía `HttpClient`, cliente público sin secret) (depende de T005)
- [X] T008 Implementar `SessionUiState` con NgRx Signals en `src/app/core/auth/session.store.ts` (`status: 'anonymous'|'authenticating'|'authenticated'|'error'`, `claims: AuthClaims|null`, `providedIn:'root'`) (data-model.md § SessionUiState; depende de T004)
- [X] T009 Implementar `role-redirect.ts` en `src/app/core/auth/role-redirect.ts`: dado `AuthClaims`, decide y ejecuta la navegación de documento completa (`window.location.href`) — admin → `${transversalBaseUrl}/api/auth/login?module=admin`; asesor con partner → activa ruta de cards; sin partner → ruta de acceso denegado (depende de T004, T008)
- [X] T010 Crear página `src/app/features/login/pages/callback/callback.ts` (standalone, OnPush): lee `code`/`state` de la URL, valida contra `PkceTransaction`, llama `exchangeCode`, decodifica el `id_token` (base64url, sin verificar firma — research.md R3) a `AuthClaims`, actualiza `session.store` y delega en `role-redirect` (depende de T006, T007, T008, T009)
- [X] T011 Crear página `src/app/features/login/pages/access-denied/access-denied.ts` (standalone, OnPush) — estado visual para asesor sin partner o fallo de intercambio de tokens (contract CT-06/CT-07)
- [X] T012 Crear `src/app/features/login/login.routes.ts` (rutas `''` y `'callback'`, `loadComponent`) y registrarlo en `src/app/app.routes.ts` (depende de T010, T011)

**Checkpoint**: el flujo de intercambio OIDC y la bifurcación por rol existen; las user stories de Fase 3+ solo añaden las pantallas/triggers específicos.

---

## Phase 3: User Story 1 - Acceso sin sesión activa (Priority: P1) 🎯 MVP

**Goal**: mostrar la página de login del SSO cuando no hay sesión de reino activa (spec FR-001, FR-002, FR-009).

**Independent Test**: abrir la app en una ventana sin cookies de IdP → debe verse el redirect hacia la página de login del SSO, sin ningún contenido de cards ni de admin. Con sesión de IdP ya activa, debe pasar directo sin pedir credenciales (silent SSO).

### Implementation for User Story 1

- [X] T013 [P] [US1] Crear página `src/app/features/login/pages/login-redirect/login-redirect.ts` (standalone, OnPush): si `session.store.status() === 'anonymous'`, genera el par PKCE (T005) + `state`/`nonce`, los persiste (T006), y ejecuta `window.location.href = buildAuthorizationUrl(...)` (T007)
- [X] T014 [US1] Registrar `login-redirect` como componente de la ruta `''` en `login.routes.ts`, de modo que cualquier navegación a la raíz sin sesión dispare el redirect (protege también acceso directo a rutas internas — spec FR-009)
- [X] T015 [US1] Verificar que la URL de autorización construida en T007 no fuerza `prompt=login` (debe omitir ese parámetro) para que la sesión de IdP ya existente resulte en retorno inmediato del `code` sin pedir credenciales (silent SSO, spec FR-002) — **validado en vivo**: silent SSO confirmado contra el IdP real en `localhost:8080` (ver Notas de validación)

**Checkpoint**: la página de login del SSO se muestra correctamente sin sesión, y el retorno silencioso funciona con sesión de IdP ya activa.

---

## Phase 4: User Story 2 - Autenticación como administrador (Priority: P1)

**Goal**: un administrador autenticado aterriza directo en la página de admin de `transversal`, sin ver la página de cards (spec FR-003, User Story 2 — decisión que actualiza 008).

**Independent Test**: autenticar (o simular `AuthClaims` con rol `platform-admin`/`partner-editor`/`auditor`) y verificar que `role-redirect` navega inmediatamente a `${transversalBaseUrl}/api/auth/login?module=admin`, sin que la ruta de cards llegue a montarse.

### Implementation for User Story 2

- [X] T016 [US2] Completar en `role-redirect.ts` (T009) la rama `claims.isAdmin === true`: `window.location.href = \`${environment.transversalBaseUrl}/api/auth/login?module=admin\`` (ningún render intermedio) — **validado en vivo** (ver Notas de validación)
- [X] T017 [US2] Asegurar en `callback.ts` (T010) que `role-redirect` se invoca inmediatamente tras derivar `AuthClaims`, antes de que Angular Router pueda resolver cualquier ruta de cards (evita un parpadeo de contenido)
- [X] T018 [P] [US2] Cubrir el caso de sesión de reino ya activa para un admin: en `login-redirect.ts` (T013), si el estado ya es `'authenticated'` con `isAdmin === true` al cargar `''`, invocar `role-redirect` directamente sin repetir el redirect a la IdP

**Checkpoint**: el flujo de administrador funciona de punta a punta, independiente de la página de cards.

---

## Phase 5: User Story 3 - Autenticación como asesor y selección de módulo (Priority: P1)

**Goal**: un asesor con partner activo ve la página de cards themeada por su partner; el clic en cualquier card lo lleva al shell de su partner en `transversal` (spec FR-004, FR-005, FR-006).

**Independent Test**: simular `AuthClaims` con `isAdmin: false` y `partnerSlug: 'banco-a'` → debe verse la página de cards con el tema de `banco-a` (o el tema neutro si el fetch de tema falla); clic en cualquier card → debe navegar a `${transversalBaseUrl}/api/auth/login?returnTo=/banco-a`. Con `partnerSlug` ausente, no debe verse ninguna card.

### Implementation for User Story 3

- [X] T019 [P] [US3] Crear `theme-queries.ts` en `src/app/features/advisor-cards/queries/theme-queries.ts`: `queryOptions()` de TanStack Query envolviendo `GET ${transversalBaseUrl}/api/theme/:slug` (reutiliza CORS ya expuesto por transversal, spec 008); en error, resolver a un tema neutro por defecto (edge case de spec)
- [X] T020 [P] [US3] Definir el modelo de cards (`id`, `label`) en `src/app/features/advisor-cards/pages/cards/card-model.ts`, con los valores tomados del diseño Figma de referencia (ver spec.md Assumptions) — nota: labels son placeholders genéricos (Simulador/Solicitudes/Reportes); el detalle pixel-perfect del diseño Figma no se importó en esta pasada
- [X] T021 [US3] Crear página `src/app/features/advisor-cards/pages/cards/cards.ts` (standalone, OnPush): consume `theme-queries` (T019) vía `injectQuery`, aplica el tema (colores/tokens) con `class`/`style` bindings (nunca `ngStyle`/`ngClass`), renderiza las cards de T020
- [X] T022 [US3] Implementar el manejador de clic en `cards.ts`: para cualquier card, `window.location.href = \`${environment.transversalBaseUrl}/api/auth/login?returnTo=/${claims.partnerSlug}\`` (aterriza en el shell `/:partnerSlug` ya existente en transversal)
- [X] T023 [US3] Crear `src/app/features/advisor-cards/advisor-cards.routes.ts` y registrarlo en `app.routes.ts`; completar en `role-redirect.ts` (T009) la rama `claims.isAdmin === false && claims.partnerSlug` presente → activar esta ruta
- [X] T024 [US3] Completar en `role-redirect.ts` (T009) la rama `claims.isAdmin === false && claims.partnerSlug` ausente → navegar a `access-denied` (T011), sin exponer ninguna card (spec FR-006, edge case)

**Checkpoint**: el flujo de asesor funciona de punta a punta, incluyendo el caso sin partner activo.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: robustez y verificación final sobre las tres user stories.

- [X] T025 [P] Manejar fallo de intercambio de tokens en `callback.ts` (T010): transición a `status: 'error'` y navegación a `access-denied` (T011) con opción de reintentar desde `''` (spec edge case, contract CT-07) — se corrigió `login-redirect.ts` para permitir reintento también desde `status: 'error'` (no solo `'anonymous'`)
- [X] T026 [P] Verificar en `session.store.ts` (T008) y `pkce-transaction.ts` (T006) que ningún token/claim se escribe en `localStorage` ni en cookies — solo en memoria (signals) y `sessionStorage` transitorio del `code_verifier` (spec FR-010)
- [X] T027 Ejecutar manualmente los 7 escenarios de `quickstart.md` (incluye el retorno tras logout de reino, contract CT-08) y registrar resultados — ver "Notas de validación" abajo. **Todos los 8 escenarios validados en vivo** contra el IdP real y `transversal` real (segunda pasada); la primera pasada encontró que `transversal` no estaba disponible y se corrigió
- [X] T028 [P] Revisar que ningún componente nuevo use `ngClass`/`ngStyle`, inyección por constructor, o `NgModule` (Constitution Check de plan.md) — `grep` confirmó cero coincidencias

## Notas de validación (T027)

### Pasada 1 (sin `transversal` corriendo)

Con el IdP real corriendo en `localhost:8080` y `webview-login` servido en
`localhost:4300` (`ng serve`), se validó en vivo con Playwright: escenario 1
(sin sesión → login SSO), escenario 2 parcial (silent SSO + `POST /token`
200 OK, pero el redirect final a `transversal` falló con
`ERR_CONNECTION_REFUSED` porque `transversal` no estaba corriendo). Esto
reveló que `transversal` **no estaba disponible** para validar el resto —
corregido en la Pasada 2.

### Pasada 2 (entorno completo: IdP + `transversal` + `webview-login`)

Se levantó `transversal` (`node --env-file=.env dist/transversal/server/server.mjs`,
ver hallazgo below) y se repitió la validación completa de los 8 escenarios
de `quickstart.md` con Playwright, con resultado exitoso tras dos
correcciones de bugs encontrados durante la propia validación (ver
"Hallazgos y correcciones"):

1. **Sin sesión activa**: `GET /` → redirect a login SSO, sin cards/admin. ✅
2. **Login admin** (`admin-user`): silent SSO + intercambio de tokens exitoso
   → aterriza en `http://localhost:4000/admin`, página real de Partners
   (Banco A/Banco B), cero contenido de cards. ✅
3. **Login asesor** (`asesor-a`, partner `banco-a`): aterriza en `/cards` con
   tema de `banco-a` (`displayName: "Banco A"`, tipografía del partner
   aplicada); clic en cualquier card → aterriza en `http://localhost:4000/banco-a`
   (shell del partner, `"Partner: banco-a"` renderizado). ✅
4. **Asesor sin partner** (`norole-user`): → `/access-denied`, "No tienes
   acceso", ninguna card expuesta. ✅
5. **Fallo de tema**: con `page.route('**/api/theme/**', abort)` simulando la
   falla, la página de cards de `asesor-a` sigue siendo usable, cae a tema
   neutro (`"Plataforma"`), sin bloquear el acceso. ✅
6. **Logout de reino**: `POST` (vía navegación) al `end_session_endpoint`
   con `client_id=backoffice-bff` (que sí tiene `post.logout.redirect.uris`
   configurado) → vuelve a `webview-login` y dispara el flujo de login SSO
   de nuevo. ✅ (nota: el cliente `webview-login` en sí no tiene
   `post.logout.redirect.uris` en el realm de prueba — validado logout vía
   el cliente `backoffice-bff`, que es el flujo real de CT-08 iniciado desde
   `transversal`).
7. **Acceso directo a ruta protegida** (`/cards` sin sesión): **encontró un
   bug real** (ver abajo, corregido) — ahora redirige correctamente al login
   SSO. ✅
8. Cubierto junto con el escenario 6.

### Hallazgos y correcciones (durante esta validación)

1. **Bug en `webview-login`: `/cards` no tenía guard de ruta.** Navegar
   directo a `http://localhost:4300/cards` sin sesión renderizaba la página
   de cards igual (con tema neutro, `partnerSlug` vacío) en vez de redirigir
   al login SSO — violación de FR-009/escenario 7. **Corregido**: se agregó
   `src/app/features/advisor-cards/guards/partner-session-guard.ts`
   (`CanActivateFn` que exige `status === 'authenticated'` y
   `claims.partnerSlug` presente, si no vuelve a `/`) y se registró en
   `advisor-cards.routes.ts` vía `canActivate`.
2. **Bug en `webview-login`: scaffold de Angular CLI sin limpiar.**
   `app.html`/`app.ts` todavía tenían el contenido placeholder del `ng new`
   (logo, links a angular.dev, `title` signal) renderizándose **encima** del
   contenido real enrutado (`<router-outlet />` estaba al final del mismo
   template). Se limpiaron ambos archivos a un `App` mínimo
   (`OnPush`, solo `<router-outlet />`); se ajustó `app.spec.ts` en
   consecuencia (se quitó el test del `h1` inexistente, se añadió
   `provideRouter([])` a los providers de test).
3. **Hallazgo operacional en `transversal` (no en el alcance de código de
   esta spec, pero bloqueaba la validación)**: `npm run serve:ssr:transversal`
   ejecuta `node dist/transversal/server/server.mjs` sin cargar `.env` (no
   hay `dotenv` ni flag `--env-file` en el script) — el proceso arranca sin
   `OIDC_CLIENT_SECRET`/`SESSION_SEAL_KEY`, y `/api/auth/login` devuelve
   `{"code":"internal","message":"Error interno"}` en cuanto se accede
   (falla en `resolveOidcSecrets()`, sin este contexto en el log por diseño
   de `logRequestError`, D FR-021). Se usó
   `node --env-file=.env dist/transversal/server/server.mjs` para esta
   validación. Vale la pena que el equipo de `transversal` decida si
   documentar esto en su `quickstart.md`/README o ajustar el script
   `serve:ssr:transversal` — queda fuera del alcance de 009 (no se tocó
   ningún archivo de `transversal`).

Con estas dos correcciones, los 8 escenarios de `quickstart.md` quedan
validados en vivo contra el IdP real y `transversal` real.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede iniciar de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA las tres user stories
- **User Stories (Phase 3-5)**: todas dependen de Foundational; son P1 las tres, pero comparten la misma infraestructura de `role-redirect.ts`/`callback.ts` — se recomienda el orden US1 → US2 → US3 (cada una añade una rama de `role-redirect.ts` ya esbozada en T009)
- **Polish (Phase 6)**: depende de que las user stories deseadas estén completas

### User Story Dependencies

- **US1**: puede empezar tras Foundational; es la base visual/de trigger que las otras dos necesitan para siquiera llegar a `callback.ts`
- **US2**: puede empezar tras Foundational; en la práctica se valida más rápido si US1 ya redirige correctamente a la IdP
- **US3**: puede empezar tras Foundational; comparte con US2 el mismo punto de bifurcación (`role-redirect.ts`) pero en una rama de código distinta — no bloquea ni es bloqueada por US2

### Parallel Opportunities

- T001-T003 (Setup) en paralelo
- T004, T005, T006 (Foundational, distintos archivos) en paralelo
- T013 (US1), T019+T020 (US3) en paralelo entre sí y respecto a T016-T018 (US2), ya que tocan archivos distintos
- T025, T026, T028 (Polish) en paralelo

---

## Parallel Example: Foundational

```bash
Task: "Crear AuthClaims model en src/app/core/auth/auth-claims-model.ts"
Task: "Implementar utilidades PKCE en src/app/core/auth/pkce.ts"
Task: "Implementar PkceTransaction en src/app/core/auth/pkce-transaction.ts"
```

---

## Implementation Strategy

### MVP First (Foundational + US1 + US2)

1. Completar Fase 1 (Setup) y Fase 2 (Foundational)
2. Completar Fase 3 (US1) — validar que sin sesión se ve el login del SSO
3. Completar Fase 4 (US2) — el flujo de administrador es el más simple de validar end-to-end (no depende de temas/partners) y sirve como primera demo completa
4. **STOP y VALIDAR**: ejecutar los escenarios 1 y 2 de `quickstart.md`

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → login del SSO validado
3. US2 → flujo admin validado end-to-end (primera demo completa)
4. US3 → flujo asesor + cards themeadas validado end-to-end
5. Polish → edge cases, seguridad de tokens, validación completa de `quickstart.md`

---

## Notes

- Ninguna tarea introduce dependencias OIDC de terceros, `NgModule`, `ngClass`/`ngStyle`, inyección por constructor, ni otra librería CSS — conforme al Constitution Check de plan.md.
- El contrato técnico transversal↔webview-login (endpoints, CORS, sellado de sesión, logout de reino) no cambia — estas tareas son enteramente del lado de `webview-login`.
- Commitear tras cada tarea o grupo lógico; detenerse en cada Checkpoint para validar la user story de forma independiente.
