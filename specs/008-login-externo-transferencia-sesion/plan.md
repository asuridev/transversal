# Implementation Plan: Login Externo (webview-login) y Transferencia de Sesión SSO al Transversal

**Branch**: `008-login-externo-transferencia-sesion` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-login-externo-transferencia-sesion/spec.md`

## Summary

El login se traslada a una app Angular independiente (`webview-login`) en un dominio
distinto, asociada a un **segundo cliente SSO del mismo reino** `backoffice`. Tras
autenticarse, la webview-login muestra la página modular de cards themeada con el tema
del partner del asesor (obtenido de la transversal), y cada card redirige a un módulo de
la transversal. La transversal **no re-implementa el login**: reutiliza su flujo OIDC
(Code+PKCE) existente, que se completa de forma **silenciosa** porque la sesión de
identidad del reino ya existe (creada al loguear en webview-login). El handoff, por
tanto, es un redirect a `GET /api/auth/login` que aterriza en el módulo elegido con la
`bo_session` ya sellada y el partner derivado del claim (PRD 07).

Cambios server-side en la transversal (cero dependencias npm nuevas): (1) registrar el
cliente `webview-login` en el realm; (2) un **catálogo de módulos** server-side que
resuelve `moduleId → ruta` con disponibilidad por rol/partner; (3) `GET /api/auth/login`
acepta `module=<id>` y el callback resuelve la ruta destino; (4) **logout único de
reino** (RP-initiated logout al `end_session_endpoint`) con retorno a webview-login;
(5) **CORS** acotado en `GET /api/theme/:slug` y `GET /api/partners/active` para el
origen de webview-login; (6) el front redirige a webview-login (no a `/forbidden`) cuando
no hay sesión. La implementación de la webview-login vive en el repo hermano y se
especifica como contrato de consumo.

## Technical Context

**Language/Version**: TypeScript 5.x; Angular 20.3 (front, zoneless SSR) + Node/Express BFF (server, `.ts` ESM con `openid-client` v6).

**Primary Dependencies**: Angular, `@ngrx/signals` (estado síncrono), `@tanstack/angular-query-experimental` (estado servidor), Tailwind v4, Express, `openid-client` v6. **Sin dependencias nuevas** (CORS y catálogo implementados a mano).

**Storage**: SQLite vía `PartnerRepository` (partners, temas publicados, `audit_log`). El catálogo de módulos es configuración estática server-side (no requiere tabla nueva).

**Testing**: Karma + Jasmine (front); pruebas de unidad/contrato del server con el runner del proyecto (`HttpTestingController` en front; dobles de `AuthRouterDeps`/`PartnerRepository` en server, patrón de 006/007).

**Target Platform**: Web (navegador) + servidor Node SSR/BFF. Dos orígenes distintos: webview-login (dominio A) y transversal (dominio B), mismo reino RH-SSO 7.6.

**Project Type**: Web application (Angular front + Express BFF en un mismo repo `src/app` + `src/server`); webview-login es un segundo proyecto Angular en repo hermano.

**Performance Goals**: Handoff percibido como instantáneo (SC-005): el silent OIDC re-auth añade solo el round-trip al IdP sin prompt. Tema cacheado (`max-age=60, stale-while-revalidate=300`, ETag) como hoy.

**Constraints**: Sin exponer tokens del IdP al navegador (SC-003); fail-secure en todo fallo (FR-005); `SameSite=Strict` en `bo_session` se mantiene (el handoff no cruza cookies entre dominios, se rehace vía OIDC). Cero deps npm nuevas.

**Scale/Scope**: Superficie Back Office existente; el catálogo de módulos inicial cubre los módulos del journey ya expuestos. Cambios acotados a `src/server/security`, `src/server/api`, `src/server/oidc`, `infra/sso`, y un ajuste de redirección en `src/app/core/auth`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Estado y Datos — Síncrono/Asíncrono**: PASS. No se añade estado de servidor al
  Store. El consumo del tema desde el front (si aplicara en la transversal) seguiría vía
  TanStack Query (`theme-queries.ts`); el estado de sesión/rol sigue en `AuthStore`
  (síncrono). El grueso del cambio es server-side (Express BFF), fuera del alcance de
  este principio. No se usa axios (el server usa `openid-client`/`fetch` nativo; el front
  usa `HttpClient`).
- **II. Componentes Standalone y OnPush**: PASS. En la transversal no se crean
  componentes nuevos (la página modular vive en webview-login). Cualquier ajuste UI (p.ej.
  pantalla intermedia) sería standalone + `OnPush` + signals. La página modular de
  webview-login se rige por la misma constitución en su repo.
- **III. Inyección de Dependencias**: PASS. La redirección a webview-login usa guard/
  initializer funcionales con `inject()`; servicios `providedIn: 'root'`.
- **IV. Estilos y Zoneless**: PASS. Sin librerías CSS nuevas; webview-login reutiliza el
  mapeo `--brand-*`/Tailwind. Proyecto zoneless intacto (sin `zone.js`/`NgZone`).

**Resultado**: Sin violaciones. `Complexity Tracking` vacío.

## Project Structure

### Documentation (this feature)

```text
specs/008-login-externo-transferencia-sesion/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones D1..D6
├── data-model.md        # Fase 1: entidades y config
├── quickstart.md        # Fase 1: guía de validación end-to-end
├── contracts/           # Fase 1: contratos
│   ├── auth-login-module.contract.md
│   ├── realm-second-client.contract.md
│   ├── theme-cors.contract.md
│   └── webview-login-consumption.contract.md
├── checklists/
│   └── requirements.md  # (de /speckit-specify)
└── tasks.md             # (Fase 2, /speckit-tasks — no lo crea /speckit-plan)
```

### Source Code (repository root)

```text
# Transversal (este repo) — BFF server-side
src/server/
├── api/
│   ├── auth-router.ts          # MOD: acepta ?module, callback resuelve ruta, logout RP-initiated
│   └── public-router.ts        # MOD: CORS en GET /theme/:slug y /partners/active
├── security/
│   ├── module-catalog.ts       # NUEVO: moduleId → { route, requiredRoles?, requiresPartner? } + resolver
│   ├── cors.ts                 # NUEVO: middleware CORS zero-dep con allowlist de orígenes
│   ├── partner-claim.ts        # REUSE: derivación del partner (007)
│   └── session-seal.ts         # REUSE: SealedSession + AEAD
├── oidc/
│   └── oidc-flow.ts            # MOD: + buildEndSessionUrl (logout de reino)
└── server.ts                   # MOD: nuevas env (WEBVIEW_LOGIN_ORIGIN/URL), wiring endSession + CORS

# Transversal — front (Angular)
src/app/core/auth/
├── auth-guard.ts               # MOD: sin sesión ⇒ redirige a webview-login (no /forbidden)
└── (initializer/interceptor)   # MOD: 401 ⇒ redirección a webview-login
src/environments/environment.ts # MOD: + webviewLoginUrl

infra/sso/realm/
└── backoffice-realm.json       # MOD: + cliente "webview-login" (redirectUris/webOrigins dominio A)

# webview-login (repo hermano C:\sofka\bnp\webview-login) — descrito como contrato
src/app/…                       # Login SSO, página modular de cards, consumo de tema
```

**Structure Decision**: Web application con BFF. El grueso vive en `src/server`
(frontera de seguridad), reutilizando el flujo OIDC y el modelo de sesión de 006/007. El
front de la transversal cambia mínimamente (una redirección de entrada). La webview-login
es un proyecto Angular separado gobernado por la misma constitución; aquí se fija su
contrato de consumo, no su implementación interna.

## Complexity Tracking

> Sin violaciones de la Constitución que justificar. Tabla intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Check

Tras el diseño de Fase 1 (research + data-model + contracts), se re-evalúan los
Principios I–IV: **sin cambios**. El diseño no introduce axios, `NgModule`, estado de
servidor en el Store, inyección por constructor, otra librería CSS ni dependencia de
`zone.js`/`NgZone`, y no agrega dependencias npm (CORS y catálogo son código propio;
`buildEndSessionUrl` es de `openid-client` ya presente). **GATE PASS**.
