# Data Model: Experiencia de Usuario de Login Externo (webview-login)

Todas las entidades aquí son **estado efímero de cliente** (viven en memoria
del navegador durante la sesión de pestaña); no hay persistencia ni base de
datos nueva. Las entidades de dominio (Partner, PublicTheme, ModuleCatalogEntry)
ya existen en `transversal` (specs 002/005/007/008) y se consumen tal cual.

## AuthClaims (cliente)

Resultado de decodificar (sin verificar firma — solo lectura de UI) el
`id_token` obtenido tras el intercambio PKCE con el `webview-login` client.

| Campo | Tipo | Notas |
|---|---|---|
| `subject` | `string` | `sub` del token |
| `roles` | `string[]` | de `realm_access.roles`, igual mapper que `backoffice-bff` |
| `partnerSlug` | `string \| undefined` | derivado del mismo claim de partner que usa transversal (007); `undefined` si 0 o >1 coincidencias |
| `isAdmin` | `boolean` (derivado) | `true` si `roles` intersecta `{platform-admin, partner-editor, auditor}` |

**Regla de derivación**: `isAdmin` se calcula, no se lee directo del token —
mismo criterio que ya usa `resolveModuleRoute` en `module-catalog.ts` de
transversal, para no divergir de la fuente de verdad server-side.

## PkceTransaction (cliente, transitorio)

Estado necesario entre el redirect hacia la IdP y el retorno a
`/callback`; sobrevive un refresh de página vía `sessionStorage` y se borra
tras usarse una vez.

| Campo | Tipo | Notas |
|---|---|---|
| `codeVerifier` | `string` | generado con `crypto.subtle`, nunca enviado a ningún servidor salvo en el POST final al `token_endpoint` |
| `state` | `string` | anti-CSRF del propio flujo OIDC del navegador |
| `nonce` | `string` | anti-replay del `id_token` |

## SessionUiState (cliente, en memoria — signal)

Estado síncrono de sesión que gobierna qué pantalla se muestra; vive en un
store de NgRx Signals (`core/auth/session.store.ts`), nunca en TanStack Query
(no es estado de servidor).

| Campo | Tipo | Notas |
|---|---|---|
| `status` | `'anonymous' \| 'authenticating' \| 'authenticated' \| 'error'` | máquina de estados de la pantalla |
| `claims` | `AuthClaims \| null` | solo presente en `'authenticated'` |

**Transiciones**: `anonymous → authenticating` (usuario inicia el redirect a
la IdP) → `authenticated` (callback exitoso) **o** `error` (fallo de
intercambio/credenciales inválidas, FR de edge case) → `anonymous` (logout o
nuevo intento).

## Card (vista, derivado — no persistido)

Representa una card de la página modular del asesor. Su contenido visual
(etiqueta, icono) proviene del diseño Figma de referencia; su **destino de
navegación** es siempre, en esta iteración, el mismo (`/:partnerSlug` en
transversal — ver spec.md Assumptions), independientemente de cuál card se
seleccione.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `string` | identificador visual de la card (no es un `moduleId` de catálogo todavía) |
| `label` | `string` | texto mostrado, según diseño Figma |
| `theme` | `PublicTheme` (reutilizado de transversal) | colores/tokens del partner del asesor, obtenido de `GET /api/theme/:slug` |

## Entidades reutilizadas sin cambios (referencia)

- **Partner**, **PublicTheme** — `specs/002-modelo-partner-theme/`,
  `specs/005-back-office-partners/`.
- **ModuleCatalogEntry** — `specs/008-login-externo-transferencia-sesion/data-model.md`
  (`module-catalog.ts` en transversal); esta spec no añade entradas nuevas al
  catálogo porque el destino de las cards de asesor es el shell público
  `/:partnerSlug`, no un `moduleId` nuevo.
