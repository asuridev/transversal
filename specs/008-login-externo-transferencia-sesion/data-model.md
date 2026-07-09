# Data Model: Login Externo (webview-login) y Transferencia de Sesión SSO

**Feature**: 008-login-externo-transferencia-sesion | **Date**: 2026-07-06

El feature **no introduce tablas ni persistencia nueva**. Reutiliza el modelo de sesión
de 006/007 y la proyección pública de tema de 002/003. Las estructuras nuevas son
**configuración estática server-side** (catálogo de módulos, allowlist CORS) y ampliación
de configuración del realm.

---

## 1. ModuleCatalogEntry (NUEVO — config estática server-side)

Mapa curado que traduce el identificador de módulo enviado por webview-login a una ruta
interna de la transversal, con reglas de disponibilidad. Vive en
`src/server/security/module-catalog.ts` (no en base de datos).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `moduleId` | `string` (clave) | Identificador estable y opaco de la card/módulo (p.ej. `journey-venta`). |
| `route` | `string` | Ruta interna real de la transversal (relativa, comienza con `/`). |
| `requiredRoles` | `AppRole[]` (opcional) | Roles que pueden acceder; ausente ⇒ cualquier sesión válida. |
| `requiresPartner` | `boolean` (opcional, default `false`) | Si `true`, exige sesión con partner (asesor); excluye admins sin partner. |

**Reglas de validación**:
- `moduleId` debe existir en el catálogo; si no ⇒ resolución `null` ⇒ fallback a ruta por
  defecto (`/admin`). Nunca se usa una ruta propuesta por el cliente.
- `route` siempre relativa y saneada (`startsWith('/') && !startsWith('//')`), reutilizando
  el criterio de `safeReturnTo`.
- Disponibilidad: `resolveModuleRoute(moduleId, { roles, hasPartner })` devuelve `route`
  solo si el `moduleId` existe, los `requiredRoles` (si los hay) intersecan `roles`, y
  `requiresPartner ⇒ hasPartner`. En cualquier otro caso ⇒ `null`.

**Función pura asociada**:
```
resolveModuleRoute(
  moduleId: string,
  ctx: { roles: AppRole[]; hasPartner: boolean },
): string | null
```

---

## 2. SealedSession (REUSE — sin cambios)

Definida en `src/server/security/session-seal.ts`. El handoff produce exactamente la
misma sesión que el login actual; **no se añaden campos**.

| Campo | Tipo | Notas |
|-------|------|-------|
| `sub` | `string` | Identidad del IdP. |
| `name` | `string` | Nombre / `preferred_username`. |
| `roles` | `AppRole[]` | `platform-admin | partner-editor | auditor`. |
| `partnerId?` | `string` | Presente ⟺ sesión de asesor (007). |
| `partnerSlug?` | `string` | Presente ⟺ sesión de asesor (007). |
| `iat` / `exp` | `number` (epoch s) | TTL de sesión (`SESSION_TTL_SECONDS`). |

Sellada como cookie `bo_session` (HttpOnly, `SameSite=Strict`, AEAD AES-256-GCM). El
navegador nunca ve tokens del IdP.

---

## 3. TxPayload (REUSE + 1 campo lógico)

Payload sellado en la cookie `bo_oidc_tx` durante el flujo OIDC
(`src/server/api/auth-router.ts`). Se amplía el uso de `returnTo` para transportar la
**ruta resuelta del módulo** (no un `moduleId` crudo del cliente): en `/auth/login` se
resuelve/valida el `module` y se sella la `returnTo` resultante.

| Campo | Tipo | Notas |
|-------|------|-------|
| `codeVerifier` / `state` / `nonce` | `string` | PKCE + anti-CSRF/replay (sin cambios). |
| `returnTo` | `string` | Ruta interna destino. Ahora puede provenir de la resolución del catálogo de módulos; sigue saneada por `safeReturnTo`. |

> Nota: la disponibilidad por rol/partner se conoce en el callback; por eso la resolución
> definitiva `moduleId → route` puede reevaluarse en el callback con los claims. La
> variante mínima sella el `moduleId` y resuelve en el callback (recomendada); la
> alternativa sella una `returnTo` provisional. Se detalla en el contrato.

---

## 4. PublicTheme (REUSE — sin cambios)

Proyección sanitizada servida por `GET /api/theme/:slug`
(`src/shared/partner/public-theme-model.ts`). webview-login la consume vía CORS y aplica
`--brand-*`. **Sin cambios de forma**; solo cambia el canal de consumo (cross-origin).

| Campo | Tipo | Notas |
|-------|------|-------|
| `slug` | `string` | Identificador del partner (o `__default__`). |
| `displayName` | `string` | Nombre visible. |
| `version` | `number` | Base del ETag/caché. |
| `tokens` | `ThemeTokens` | Colores/tipografía → `--brand-*`. |
| `assets` | `ThemeAssets` | Logos, favicon, co-branding, og:image. |
| `legal` | `ThemeLegal` | Disclaimer + enlaces legales. |
| `typography` | `ThemeTypography` | Familia + `woff2` opcional. |

---

## 5. CorsAllowlist (NUEVO — config de entorno)

Configuración de orígenes permitidos para el endpoint público de tema.

| Campo | Fuente | Descripción |
|-------|--------|-------------|
| `allowedOrigins` | env `WEBVIEW_LOGIN_ORIGIN` | Uno o varios orígenes (esquema+host+puerto) del dominio de webview-login autorizados a leer el tema cross-origin. |

Comportamiento: si el `Origin` de la petición está en `allowedOrigins`, se emite
`Access-Control-Allow-Origin: <origin>` + `Vary: Origin`; preflight `OPTIONS` responde
`204` con `Access-Control-Allow-Methods: GET` y `Access-Control-Allow-Headers:
If-None-Match`. Sin credenciales (no cookies).

---

## 6. SSO Realm Config (AMPLIACIÓN — `backoffice-realm.json`)

| Elemento | Cambio | Descripción |
|----------|--------|-------------|
| Cliente `webview-login` | NUEVO | Cliente OIDC del realm `backoffice`; `redirectUris`/`webOrigins` del dominio A; mismos protocol mappers (`realm_access.roles`, `partner`); `pkce.code.challenge.method=S256`. |
| Cliente `backoffice-bff` | MOD (opcional) | Añadir `post.logout.redirect.uris` = URL base de webview-login para el RP-initiated logout (D4). |

---

## Relaciones

```
webview-login (SSO client A) ──autentica──▶ Realm backoffice ──sesión SSO──▶ transversal (SSO client B)
        │                                        │ claim: partner, realm_access.roles
        │ deriva partner del token (D5)          ▼
        └── GET /api/theme/:slug (CORS, D6) ──▶ PublicTheme ──▶ aplica --brand-*
        │
        └── click card (moduleId) ──▶ GET /api/auth/login?module=<id> ──▶ silent OIDC ──▶ callback
                                                                              │ resolveModuleRoute
                                                                              ▼
                                                              bo_session sellada + redirect a route
```

**Sin migraciones. Sin dependencias npm nuevas.**
