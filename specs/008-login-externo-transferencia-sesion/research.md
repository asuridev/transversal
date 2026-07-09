# Research: Login Externo (webview-login) y Transferencia de Sesión SSO

**Feature**: 008-login-externo-transferencia-sesion | **Date**: 2026-07-06

Resuelve los `NEEDS CLARIFICATION` del Technical Context. Todas las decisiones ya
acordadas en `/speckit-clarify` (Session 2026-07-06) se consolidan aquí como base del
diseño. No queda ninguna clarificación abierta.

---

## D1 — Mecanismo de transferencia de sesión: silent OIDC re-auth

**Decision**: La transversal reutiliza su flujo OIDC existente (`GET /api/auth/login` →
IdP → `GET /api/auth/callback`) con su cliente `backoffice-bff`. Como el reino RH-SSO ya
tiene una sesión de identidad activa (cookie del IdP creada al autenticarse en
webview-login), el `authorization_endpoint` responde **sin prompt** (SSO silencioso) y el
callback sella `bo_session` como hoy. El "handoff" es un simple redirect del navegador
desde webview-login a `https://<transversal>/api/auth/login?module=<id>`.

**Rationale**:
- Cero primitivas nuevas: `auth-router.ts`, `oidc-flow.ts` y `session-seal.ts` ya
  implementan Code+PKCE, validación de firma/`iss`/`aud`/`exp`/`nonce` y sellado AEAD.
- No cruza cookies entre dominios: `bo_session` permanece `SameSite=Strict` en el origen
  de la transversal; no hace falta relajar cookies ni compartir dominio padre.
- No expone tokens al navegador (SC-003): los tokens se descartan tras `tokens.claims()`
  (ver `oidc-flow.ts:55`).

**Alternatives considered**:
- *Token de transferencia firmado (AES-GCM con `SESSION_SEAL_KEY` compartido)*: evita un
  round-trip al IdP pero añade un endpoint de canje, sincronización de claves entre apps y
  una superficie de replay que gestionar. Rechazada por mayor complejidad/riesgo sin
  beneficio real (el SSO silencioso ya es imperceptible).
- *Cookie de dominio padre compartido*: exige mismo dominio raíz (contradice "dominio
  totalmente diferente") y relaja `SameSite`. Rechazada.

---

## D2 — Segundo cliente SSO en el mismo reino

**Decision**: Añadir a `infra/sso/realm/backoffice-realm.json` un cliente
`webview-login` (confidencial o público según despliegue) en el realm `backoffice`, con
sus propios `redirectUris`/`webOrigins` (dominio A de webview-login) y los **mismos
protocol mappers** (`realm_access.roles`, `partner`). Ambos clientes comparten la sesión
de identidad del realm, habilitando el SSO silencioso de D1.

**Rationale**: RH-SSO mantiene la sesión de usuario a nivel de realm; cualquier cliente
del mismo realm reutiliza esa sesión. Reusar los mappers garantiza que el token de
webview-login trae el mismo claim `partner` (base de D5) y roles.

**Alternatives considered**: Un realm separado con federación — rechazado, rompe el SSO
compartido y el requisito explícito de "mismo reino".

---

## D3 — Catálogo de módulos server-side (card → ruta)

**Decision**: Nuevo `src/server/security/module-catalog.ts` con un mapa estático
`moduleId → { route, requiredRoles?, requiresPartner? }` y un resolutor
`resolveModuleRoute(moduleId, { roles, hasPartner }): string | null`. La webview-login
envía solo el `moduleId`; el servidor resuelve la ruta real y valida disponibilidad por
rol/partner. `moduleId` inexistente o no disponible ⇒ `null` ⇒ fallback a la ruta por
defecto (`/admin`), nunca a una ruta arbitraria del cliente.

**Rationale**: Cumple FR-010/FR-011 y la clarificación (catálogo curado). Elimina la
clase open-redirect: el cliente nunca propone rutas. La disponibilidad real por rol/
partner solo se conoce tras el callback (cuando hay claims), por lo que la resolución
definitiva ocurre en el callback; en `/auth/login` solo se valida existencia básica del
`moduleId` para poder sellarlo en el tx.

**Alternatives considered**:
- *`returnTo` como ruta relativa validada por allowlist* (lo que hoy hace `safeReturnTo`):
  aceptable pero deja al cliente proponiendo la ruta. Rechazada frente al catálogo por
  identificador (más restrictivo). Se **mantiene** `safeReturnTo` como saneo defensivo
  para compatibilidad, pero el camino primario es `module`.

---

## D4 — Logout único de reino (RP-initiated logout)

**Decision**: `POST /api/auth/logout` pasa a hacer **RP-initiated logout**: además de
expirar `bo_session`/`csrf`, devuelve/redirige al `end_session_endpoint` del IdP con
`post_logout_redirect_uri` = URL base de webview-login. Se añade `buildEndSessionUrl` en
`oidc-flow.ts` (usa `client.buildEndSessionUrl` de `openid-client` v6) y una dependencia
`endSession`/`postLogoutRedirectUri` en `AuthRouterDeps` (esta última ya existe). En el
front, un 401 (sesión expirada) redirige a webview-login en vez de a `/forbidden`.

**Rationale**: FR-014 exige que no queden sesiones de realm huérfanas. `openid-client` ya
está presente, así que no hay dependencia nueva. Distinguir "sin sesión" (→ webview-login)
de "autenticado pero prohibido" (→ `/forbidden`) evita romper la semántica de authz de
006.

**Alternatives considered**: Logout solo local (expirar cookies) — rechazado, deja viva
la sesión del realm y permitiría re-entrar sin credenciales tras "cerrar sesión".

---

## D5 — Origen del partnerSlug para el tema (webview-login deriva de su token)

**Decision**: La webview-login deriva el partner de **su propio token de identidad** del
realm (mismo claim `partner` que usa `partner-claim.ts` en la transversal) y pide
`GET https://<transversal>/api/theme/:slug`. La transversal no expone un endpoint "mi
partner" nuevo.

**Rationale**: Ambas apps están en el mismo realm con el mismo mapper `partner`, así que
el token de webview-login ya contiene el claim. Mantiene a webview-login autosuficiente,
evita un round-trip y no acopla la pantalla de login a un endpoint de sesión de la
transversal. La lógica de derivación espeja `derivePartnerRef` (cardinalidad exactamente-
uno; 0/>1 ⇒ sin partner ⇒ tema neutro).

**Alternatives considered**: Endpoint centralizado en la transversal que resuelve partner
+ tema en un paso — rechazado por acoplamiento y round-trip extra. Slug por URL/param —
rechazado, el cliente elegiría el slug (no server-side).

---

## D6 — CORS acotado en el endpoint público de tema

**Decision**: Añadir un middleware CORS **zero-dependencia**
(`src/server/security/cors.ts`) aplicado a `GET /api/theme/:slug` y
`GET /api/partners/active`, con allowlist de orígenes desde env
(`WEBVIEW_LOGIN_ORIGIN`, admite lista). Responde `Access-Control-Allow-Origin` (eco del
origen permitido), `Vary: Origin`, y maneja preflight `OPTIONS`. No se habilita CORS con
credenciales (el tema es público, sin cookies).

**Rationale**: webview-login (dominio A) hace un fetch de navegador cross-origin al API de
la transversal (dominio B); sin CORS el navegador bloquea la respuesta. Acotar por
allowlist evita abrir el endpoint a cualquier origen. Implementarlo a mano respeta la
regla de cero dependencias nuevas; el endpoint ya es público y cacheado (ETag), así que
CORS no introduce riesgo de datos sensibles (la proyección `PublicTheme` ya está
sanitizada).

**Alternatives considered**:
- *Paquete `cors`*: introduce dependencia npm nueva — rechazado por la convención del
  proyecto.
- *Proxy same-origin en el BFF de webview-login*: viable si webview-login tuviera su
  propio server, pero D5 la define como SPA que consume directamente; CORS es lo más
  simple y directo.

---

## Reutilización confirmada (sin reimplementar)

| Necesidad | Se reutiliza | Ubicación |
|-----------|--------------|-----------|
| Flujo OIDC Code+PKCE | `buildAuthorizationUrl`, `authorizationCodeGrant` | `src/server/oidc/oidc-flow.ts` |
| Sellado de sesión AEAD | `SealedSession`, `createSessionSeal` | `src/server/security/session-seal.ts` |
| Derivación de partner por claim | `derivePartnerRef` | `src/server/security/partner-claim.ts` |
| Derivación de roles | `deriveRoles` | `src/server/security/role-map.ts` |
| Proyección pública de tema | `toPublicTheme`, `getDefaultPublicTheme` | `src/shared/partner/…`, `src/server/theme/default-theme.ts` |
| Endpoint de tema | `GET /theme/:slug` | `src/server/api/public-router.ts` |
| Mapeo tokens→CSS vars | `toCssVars`, bloque `@theme` | `src/app/core/theme/theme-css-vars.ts`, `src/styles.css` |
| Aislamiento y auditoría post-aterrizaje | `require-partner-scope`, `audit_log` | `src/server/security/…` (007) |

**Conclusión Fase 0**: Sin `NEEDS CLARIFICATION` pendientes. Diseño listo para Fase 1.
