# Quickstart: Validación del Login Externo + Transferencia de Sesión

**Feature**: 008-login-externo-transferencia-sesion | **Date**: 2026-07-06

Guía de validación end-to-end del handoff webview-login → transversal. Asume el stack de
006/007 en marcha (RH-SSO local, BFF de la transversal, SQLite con partners/temas). No
duplica detalle: ver [contracts/](./contracts) y [data-model.md](./data-model.md).

## Prerrequisitos

- RH-SSO local con el realm `backoffice` importado, incluyendo el **segundo cliente
  `webview-login`** (ver `realm-second-client.contract.md`) y `post.logout.redirect.uris`
  en `backoffice-bff`.
- Variables de entorno del server de la transversal (además de las de 006/007):
  - `WEBVIEW_LOGIN_ORIGIN` — origen(es) permitido(s) para CORS del tema.
  - `WEBVIEW_LOGIN_URL` — URL base de webview-login (post-logout + redirección de front).
- webview-login corriendo en su dominio/origen (repo hermano) apuntando al cliente
  `webview-login`.
- Usuarios de prueba del realm: `asesor-a` (partner `banco-a`), `asesor-b` (`banco-b`),
  `asesor-inactivo` (`banco-inactivo`), `admin-user` (sin partner).

## Escenario 1 — Handoff de sesión (US1, P1)

1. Abrir webview-login (dominio A) e iniciar sesión como `asesor-a`.
2. En la página modular, click en una card cuyo `moduleId` esté disponible para asesores.
3. **Esperado**: el navegador va a `https://<transversal>/api/auth/login?module=<id>`, el
   IdP responde **sin pedir credenciales** (SSO silencioso), y se aterriza en la ruta del
   módulo con sesión activa.
4. Verificar: `GET /api/admin/session` devuelve `{ subject, name, roles, partnerId,
   partnerSlug: "banco-a" }`. Inspeccionar cookies: existe `bo_session` (HttpOnly); **no**
   hay tokens del IdP en el navegador. (SC-001, SC-003)

## Escenario 2 — Tema del partner en la página modular (US2, P2)

1. Autenticado como `asesor-a`, observar la página modular: colores/logo/footer del
   partner `banco-a`.
2. Repetir con `asesor-b`: branding de `banco-b`, sin mezcla. (SC-002)
3. Comprobar la petición `GET https://<transversal>/api/theme/banco-a` desde el dominio A:
   respuesta `200` con `Access-Control-Allow-Origin` = origen de webview-login, `Vary:
   Origin`, `ETag`. (theme-cors.contract CT-20/21)
4. `admin-user` y `asesor-inactivo`: la página modular usa **tema neutro** (`__default__`).
   (FR-001b, FR-009)

## Escenario 3 — Navegación por card al módulo (US3, P3)

1. Click en distintas cards → cada una aterriza en su módulo correcto de la transversal.
   (SC-004)
2. Forzar `GET /api/auth/login?module=<inexistente>` → tras callback, fallback a `/admin`
   (no ruta arbitraria). (auth-login-module CT-02)
3. Como `admin-user`, intentar un `module` con `requiresPartner=true` → fallback, sin
   acceso al módulo de asesor. (CT-03)

## Escenario 4 — Logout único de reino (FR-014)

1. Autenticado en la transversal, ejecutar `POST /api/auth/logout` (con header CSRF).
2. **Esperado**: `bo_session`/`csrf` expiradas + redirección al `end_session_endpoint`
   con `post_logout_redirect_uri` = webview-login. (realm-second-client CT-11)
3. Volver a la transversal sin re-autenticar en webview-login → **no** se establece sesión
   (la sesión del realm terminó). (CT-12)

## Escenario 5 — Fail-secure / sesión ausente (FR-005, FR-006)

1. Entrar directo a una ruta de la transversal sin sesión de realm → el front redirige a
   webview-login (no `/forbidden`). (CT-13)
2. Simular fallo del intercambio de código en el callback → `302 /forbidden`, sin
   `bo_session`. (CT-06)

## Comprobaciones automatizadas (referencia)

- Server (unidad/contrato): `module-catalog` (`resolveModuleRoute`), `auth-router`
  (`module` → ruta, callback, logout end-session), `cors` middleware. Ver los `CT-xx` en
  [contracts/](./contracts).
- Front (Karma/Jasmine): guard/initializer redirige a webview-login en `401`.
- Regresión: la suite de 006/007 (aislamiento, auditoría, roles) sigue verde tras el
  aterrizaje. (SC-007)

## Criterio de éxito global

Un asesor entra por webview-login, ve su branding, elige una card y opera en la transversal
autenticado sin re-credenciales; los admins ven tema neutro; el logout cierra la sesión del
realm; y ningún token del IdP toca el navegador.
