# Contract: CORS acotado para el tema público

**Feature**: 008 | **Endpoints**: `GET /api/theme/:slug`, `GET /api/partners/active`
**Archivos**: `src/server/security/cors.ts` (NUEVO), `src/server/api/public-router.ts` (MOD),
`src/server.ts` (MOD env)

## Objetivo

Permitir que webview-login (dominio A) lea el tema del partner desde el API de la
transversal (dominio B) mediante un fetch de navegador cross-origin, sin abrir el endpoint
a orígenes arbitrarios. Cubre FR-007, FR-008, FR-009.

## Middleware CORS (zero-dependencia)

`createCorsMiddleware({ allowedOrigins: string[] })` → Express middleware:
- Lee el header `Origin` de la petición.
- Si `Origin ∈ allowedOrigins`:
  - `Access-Control-Allow-Origin: <Origin>` (eco exacto, no `*`).
  - `Vary: Origin`.
- Si es preflight (`OPTIONS`): responde `204` con
  `Access-Control-Allow-Methods: GET, OPTIONS` y
  `Access-Control-Allow-Headers: If-None-Match` y termina.
- Si `Origin` ausente o no permitido: no añade cabeceras CORS (petición same-origin o
  bloqueada por el navegador). **No** se usa `Access-Control-Allow-Credentials` (el tema es
  público, sin cookies).

## Aplicación

- Se aplica **solo** a `GET /theme/:slug` y `GET /partners/active` del `public-router`
  (rutas públicas ya cacheadas). No se aplica a `/journey`, `/auth`, ni `/admin`.
- Mantiene los headers actuales `Cache-Control` y `ETag`; el manejo `If-None-Match` →
  `304` no cambia.

## Configuración

- `WEBVIEW_LOGIN_ORIGIN` (env): origen(es) permitido(s) (coma-separado). Ej.
  `https://login.partner.example`.
- En dev, incluir el origen local de webview-login.

## Criterios de aceptación

- **CT-20**: `GET /theme/:slug` con `Origin` permitido ⇒ respuesta incluye
  `Access-Control-Allow-Origin: <Origin>` y `Vary: Origin`. (FR-007)
- **CT-21**: Preflight `OPTIONS /theme/:slug` con `Origin` permitido ⇒ `204` con
  `Allow-Methods`/`Allow-Headers` correctos. (FR-007)
- **CT-22**: `GET /theme/:slug` con `Origin` **no** permitido ⇒ sin cabeceras CORS (el
  navegador bloquea la lectura cross-origin). (seguridad)
- **CT-23**: La respuesta sigue siendo `PublicTheme` sanitizado (sin campos internos) y
  cacheable (ETag intacto). (FR-007)
- **CT-24**: Partner inactivo / sin tema publicado ⇒ `getDefaultPublicTheme()` (tema
  neutro), igual que hoy. (FR-009)
- **CT-25**: Sin `Access-Control-Allow-Credentials`; no se transmiten cookies. (SC-003)
