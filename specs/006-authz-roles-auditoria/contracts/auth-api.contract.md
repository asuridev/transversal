# Contract: Auth API del BFF (OIDC + sesión)

**Feature**: `006-authz-roles-auditoria` · Superficie server-side nueva bajo
`/api/auth/*` + `/api/admin/session`. Mediación OIDC (Code + PKCE) y ciclo de
sesión. Ver `research.md` D1/D2/D3/D6/D10.

Convención de errores: reusa `createApiError(code, message, requestId)` y
`httpStatusForCode` de `src/server/http/api-error.ts` (mismo formato que el resto
del BFF). Router nuevo `src/server/api/auth-router.ts`, montado en
`createApiRouter` antes/junto a `/admin`.

---

## `GET /api/auth/login`

Inicia el flujo OIDC (US1 esc.1).

- Genera `code_verifier` + `code_challenge` (S256) y `state`/`nonce`
  (`openid-client`, D1). Sella `{ code_verifier, state, nonce, returnTo }` en una
  **cookie temporal httpOnly** `bo_oidc_tx` (SameSite=Lax, corta) — necesaria para
  recuperarlos en el callback.
- `302` → `authorization_endpoint` del issuer (`buildAuthorizationUrl`).
- Query opcional `?returnTo=/admin/...` (validado same-origin) para volver a la
  ruta pedida tras autenticarse.

## `GET /api/auth/callback`

Retorno del IdP (US1 esc.2).

- Lee `bo_oidc_tx`; ejecuta `authorizationCodeGrant(config, currentUrl,
  { pkceCodeVerifier, expectedState, expectedNonce })` (valida firma JWKS, `iss`,
  `aud`, `exp`, `nonce` — FR-003).
- Deriva identidad (`sub`, `name`) y **roles de aplicación** vía `RoleMapConfig`
  (D5). **Descarta** el access/ID token del IdP (FR-002, SC-002).
- Emite:
  - `bo_session` (sellada AEAD, `HttpOnly; Secure; SameSite=Strict`, D2/D3).
  - `csrf` (aleatoria, **no** httpOnly, `SameSite=Strict`, D4).
  - Borra `bo_oidc_tx`.
- `302` → `returnTo` (o `/admin`).
- **Errores**: `state`/`nonce` inválidos, firma/aud/exp inválidos, o IdP no
  disponible ⇒ **falla segura** sin emitir sesión (edge "claim manipulado",
  "IdP no disponible"): `302 → /forbidden` o página de error, nunca acceso.

## `GET /api/admin/session`  *(whoami)*

Estado de sesión para el bootstrap del front (D10).

- Con `bo_session` válida (desellada, no expirada) ⇒ `200`:
  ```json
  { "subject": "u-123", "name": "Ana Pérez", "roles": ["partner-editor"] }
  ```
  El token del IdP **no** aparece (SC-002).
- Sin sesión / expirada / inválida ⇒ `401` (`createApiError('unauthorized', …)`).
  El front reacciona iniciando `GET /api/auth/login` (US1 esc.4, SC-004).

## `POST /api/auth/logout`

- Borra `bo_session` y `csrf`. Opcionalmente `302` → `end_session_endpoint` del
  IdP (RP-initiated logout) con `OIDC_POST_LOGOUT_REDIRECT_URI`.
- Requiere CSRF válido (es mutación de estado de sesión).

---

## Notas de seguridad (mapeo a requisitos)

| Regla | Requisito |
|-------|-----------|
| Token del IdP nunca cruza al cliente; solo cookie `bo_session` httpOnly | FR-002, SC-002 |
| Validación firma/exp/aud/iss/nonce server-side antes de sesión | FR-003 |
| `SameSite=Strict` + httpOnly en `bo_session` | edge XSS/CSRF |
| Fallo del IdP ⇒ sin acceso (fail-safe) | edge "IdP no disponible" |
| `exp` corto; sin refresh en V1; re-login re-deriva roles | FR-014, D3 |
</content>
