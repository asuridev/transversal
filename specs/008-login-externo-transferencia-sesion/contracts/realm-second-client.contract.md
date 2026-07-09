# Contract: Segundo cliente SSO + logout único de reino

**Feature**: 008 | **Archivos**: `infra/sso/realm/backoffice-realm.json` (MOD),
`src/server/oidc/oidc-flow.ts` (MOD), `src/server/api/auth-router.ts` (MOD `/auth/logout`),
`src/server.ts` (MOD wiring)

## Objetivo

Registrar la aplicación webview-login como un **segundo cliente OIDC del mismo reino** y
convertir el logout en **RP-initiated logout** que termina la sesión de identidad del
realm. Cubre FR-001, FR-002 y FR-014.

## Cliente `webview-login` (realm `backoffice`)

Nuevo entry en `clients[]` con, al menos:
- `clientId: "webview-login"`, `protocol: "openid-connect"`, `standardFlowEnabled: true`,
  `implicitFlowEnabled: false`, `directAccessGrantsEnabled: false`.
- `redirectUris`: callback(s) del dominio A de webview-login.
- `webOrigins`: origen(es) del dominio A.
- `attributes."pkce.code.challenge.method": "S256"`.
- **Mismos protocol mappers** que `backoffice-bff`: `realm-roles`
  (`realm_access.roles`) y `partner-claim` (`partner`). Esto garantiza que el token de
  webview-login trae el claim `partner` para D5.

Requisito de comportamiento: autenticarse en `webview-login` establece la sesión de
usuario del realm; una posterior autorización de `backoffice-bff` (el login de la
transversal) se resuelve **sin prompt** (SSO silencioso).

## Cliente `backoffice-bff` (MOD)

- Añadir `post.logout.redirect.uris` (o equivalente) que incluya la URL base de
  webview-login, para permitir el `post_logout_redirect_uri` del RP-initiated logout.

## `buildEndSessionUrl` (oidc-flow.ts, NUEVO)

```
buildEndSessionUrl(config, { postLogoutRedirectUri, idTokenHint? }): URL
```
- Envuelve `client.buildEndSessionUrl` de `openid-client` v6 (dependencia ya presente).
- Devuelve la URL del `end_session_endpoint` del IdP con `post_logout_redirect_uri`.

## `POST /api/auth/logout` (MOD)

**Comportamiento**:
1. Verificar CSRF (double-submit) — sin cambios; inválido ⇒ `403`.
2. Expirar cookies `bo_session` + `csrf` (sin cambios).
3. **Nuevo**: responder con la URL de `end_session_endpoint`
   (`buildEndSessionUrl({ postLogoutRedirectUri: <webview-login base> })`) para que el
   cliente redirija (o `302` directo), terminando la sesión del realm y devolviendo al
   usuario a webview-login.

**Fail-safe**: si el descubrimiento/end-session no está disponible, se expiran las cookies
locales de todos modos (no se deja sesión operativa viva en la transversal).

## Front (transversal): expiración de sesión

- Un `401` de `GET /api/admin/session` u otra llamada autenticada ⇒ redirigir el navegador
  a la URL de webview-login (`environment.webviewLoginUrl`), **no** a `/forbidden`.
- `/forbidden` se reserva para "autenticado pero sin permiso" (authz de 006), no para
  "sin sesión".

## Criterios de aceptación

- **CT-10**: Autenticado en webview-login, al iniciar el login de la transversal el IdP no
  solicita credenciales (SSO silencioso). (FR-002, SC-001, SC-005)
- **CT-11**: `POST /auth/logout` expira `bo_session`/`csrf` **y** produce la URL de
  `end_session_endpoint` con `post_logout_redirect_uri` = webview-login. (FR-014)
- **CT-12**: Tras logout, re-entrar a la transversal sin re-autenticar en webview-login
  no establece sesión (la sesión del realm terminó). (FR-014)
- **CT-13**: Una llamada autenticada con sesión expirada ⇒ el front redirige a
  webview-login, no a `/forbidden`. (FR-006)
- **CT-14**: El token de webview-login contiene el claim `partner` (mappers replicados).
  (D5, FR-008)
