# Contract: Login con destino por módulo + callback (silent OIDC handoff)

**Feature**: 008 | **Endpoints**: `GET /api/auth/login`, `GET /api/auth/callback`
**Archivo**: `src/server/api/auth-router.ts` (MOD) + `src/server/security/module-catalog.ts` (NUEVO)

## Objetivo

Permitir que webview-login redirija al usuario a la transversal indicando un **módulo
destino por identificador** (no una ruta), completar el login vía SSO silencioso y
aterrizar en la ruta real del módulo con `bo_session` sellada. Cubre FR-001, FR-003,
FR-004, FR-005, FR-006, FR-010, FR-011.

## `GET /api/auth/login`

**Query params**:
- `module` (opcional): identificador de módulo/card. Debe existir en el catálogo
  (`module-catalog.ts`). Ausente o desconocido ⇒ se usará el destino por defecto.
- `returnTo` (opcional, legacy): ruta relativa saneada por `safeReturnTo`. Se mantiene por
  compatibilidad; si `module` está presente, `module` tiene prioridad.

**Comportamiento**:
1. Construir la autorización OIDC (PKCE S256 + state + nonce) como hoy.
2. Sellar en `bo_oidc_tx` el payload `{ codeVerifier, state, nonce, moduleId?, returnTo }`:
   - Si `module` existe en el catálogo ⇒ sellar `moduleId`.
   - Si no ⇒ sellar `returnTo` saneado (o el default `/admin`).
3. `302` al `authorization_endpoint` del IdP.

**Nota de seguridad**: en `/auth/login` la sesión aún no existe (no hay roles/partner),
por lo que solo se valida **existencia** del `moduleId`. La disponibilidad por rol/partner
se evalúa en el callback.

## `GET /api/auth/callback`

**Comportamiento** (extiende el actual):
1. Unsellar `bo_oidc_tx`; ausente/corrupto ⇒ `302 /forbidden` (sin cambios).
2. Intercambiar el `code` por claims; derivar `sub`, `name`, `roles` (`deriveRoles`) y
   `partnerRef` (`derivePartnerRef`) — **igual que hoy** (007).
3. Validar partner (existencia + `active`) como hoy; inválido ⇒ `302 /forbidden`.
4. **Resolver la ruta destino**:
   - Si el tx trae `moduleId`:
     `route = resolveModuleRoute(moduleId, { roles, hasPartner: partnerSlug !== undefined })`.
   - Si `route === null` (módulo inexistente o no disponible para el rol/partner) ⇒
     `route = DEFAULT_RETURN_TO` (`/admin`). **Nunca** se usa una ruta propuesta por el
     cliente.
   - Si el tx trae `returnTo` (legacy) ⇒ `route = safeReturnTo(returnTo)`.
5. Sellar `bo_session` + `csrf` (sin cambios) y `302` a `route`.
6. Cualquier fallo del intercambio ⇒ `302 /forbidden` (fail-secure, sin sesión).

## `resolveModuleRoute` (module-catalog.ts)

```
resolveModuleRoute(moduleId, { roles, hasPartner }): string | null
```
- Devuelve `route` **solo si**: el `moduleId` existe **y** (`requiredRoles` ausente **o**
  interseca `roles`) **y** (`requiresPartner` falso **o** `hasPartner === true`).
- En cualquier otro caso ⇒ `null`.
- `route` siempre relativa y saneada.

## Criterios de aceptación (pruebas)

- **CT-01**: `login?module=<válido>` → tras callback con sesión, `302` a la `route` del
  catálogo. (FR-010)
- **CT-02**: `login?module=<inexistente>` → callback `302` a `/admin` (fallback), nunca a
  una ruta arbitraria. (FR-011)
- **CT-03**: `module` con `requiresPartner=true` y sesión **sin** partner (admin) →
  fallback a `/admin`, no acceso al módulo de asesor. (FR-011, FR-001b)
- **CT-04**: `module` con `requiredRoles` que no interseca los roles de la sesión →
  fallback. (FR-011)
- **CT-05**: Sin `bo_oidc_tx` en callback → `302 /forbidden`. (FR-005)
- **CT-06**: Fallo del intercambio de código → `302 /forbidden`, sin `Set-Cookie`
  `bo_session`. (FR-005, SC-003)
- **CT-07**: Ningún token del IdP aparece en cookies ni cuerpo de respuesta. (SC-003)
- **CT-08**: `login` sin `module` ni `returnTo` → aterriza en `/admin`. (compat)
