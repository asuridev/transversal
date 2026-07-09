# Quickstart: Aislamiento de Asesor por Partner (Tenant Isolation)

**Feature**: `007-aislamiento-asesor-partner` · **Fase**: 1

Valida de punta a punta que **un asesor del partner A no puede acceder a la vista
ni a los datos del partner B**, y que la frontera es **server-side**. Referencia:
`contracts/journey-authz.contract.md`, `contracts/partner-claim.contract.md`,
`contracts/front-partner-scope.contract.md`.

---

## Prerrequisitos

- Node 22+, y el BFF/SSR de `003`/`006` funcionando (`npm run dev` / `npm start`
  según el proyecto).
- IdP **RH-SSO 7.6** en dev vía podman (de `006`), con el realm extendido (D8):
  - Protocol mapper que emite el claim de partner (`PARTNER_CLAIM_PATH`).
  - Usuarios asesor de prueba: `asesor-a` (partner `banco-a`) y `asesor-b`
    (partner `banco-b`).
  - Un usuario admin de Back Office (sin claim de partner) para el caso de
    control.
- Catálogo con `banco-a` y `banco-b` **activos** (y uno inactivo para el caso de
  deny), vía el seed/repositorio de `002`.
- Variables de entorno: `PARTNER_CLAIM_PATH` (además de las de `006`:
  `OIDC_*`, `SESSION_SEAL_KEY`, `ROLE_*`).

---

## A. Validación unitaria (server) — rápida, sin navegador

```bash
npm run test:server
```

Debe cubrir (ver contratos):

- `partner-claim.test.ts`: claim único ⇒ slug; ausente/vacío ⇒ null; múltiple ⇒
  null; tipo inválido ⇒ null.
- `session-seal.test.ts`: round-trip **con** y **sin** partner; manipulación ⇒
  null; expirado ⇒ null.
- `require-partner-scope.test.ts`: sin sesión ⇒ 401; sin partner ⇒ 404; cruce ⇒
  404 + auditoría; partner inactivo ⇒ 404; match ⇒ `next()` con `req.partner`.
- `journey-router.test.ts`: matriz completa de la tabla de
  `journey-authz.contract.md` §2.
- `auth-router.test.ts`: asesor con partner activo ⇒ sesión con `partnerId/slug`;
  inexistente/inactivo ⇒ `/forbidden` sin sesión.

**Esperado**: todos verdes.

---

## B. Validación E2E manual (agente / Playwright CLI)

### B1. Acceso legítimo (asesor A ve solo A)

1. Autenticarse como `asesor-a` (login OIDC reutilizado de `006`).
2. `GET /api/admin/session` ⇒ `200` con `partnerSlug: "banco-a"`.
3. `POST /api/journey/banco-a/<action>` con un body válido ⇒ `200`
   (orquesta contra `banco-a`).
4. En el navegador, la vista muestra la marca y datos de `banco-a`; **no** hay
   selector ni enlace a otro partner (US1).

### B2. Rechazo de acceso cruzado — server-side (asesor A → B)

1. Como `asesor-a`, emitir directamente (curl/fetch, saltándose el front):
   `POST /api/journey/banco-b/<action>`.
2. **Esperado**: `404 not_found` (indistinguible de "no existe"; **no** revela
   datos ni la existencia de `banco-b`) — FR-004/005/007.
3. Verificar la traza: exactamente **una** fila en `audit_log` con
   `entity:"access"`, `action:"cross_partner_denied"`, `entityId:"banco-b"`,
   `actorSub` del asesor A — FR-011.
4. Repetir enviando `{ "partnerId": "banco-b" }` en el **cuerpo** con URL
   `banco-a` ⇒ `200` orquestando `banco-a` (el partner del cuerpo se **ignora**) —
   FR-005.

### B3. Guard de front (UX)

1. Como `asesor-a`, navegar manualmente a la ruta de `banco-b`.
2. **Esperado**: redirección a la vista de `banco-a` (o `/forbidden`) **antes** de
   render — `partnerScopeMatch` (D6). La seguridad real (B2) opera igual aunque se
   fuerce.

### B4. Deny por vínculo inválido

1. Autenticarse como un asesor cuyo claim de partner apunta a un partner
   **inactivo** o inexistente.
2. **Esperado**: no se emite sesión de asesor (redirect `/forbidden` en el
   callback) — FR-008.
3. Autenticarse como **admin** (sin claim de partner) y `POST /api/journey/…` ⇒
   `404` (no es asesor; sin partner en sesión) — paso 2 del middleware.

---

## Criterios de aceptación del quickstart

- [ ] B1: asesor A opera `banco-a` y solo ve `banco-a` (SC-001, US1).
- [ ] B2: todo intento A→B server-side ⇒ `404`, sin fuga, con auditoría (SC-002/
      005/007, US2, FR-011).
- [ ] B2.4: identificador de partner del cliente ignorado (SC-004, FR-005).
- [ ] B3: el guard de front redirige, pero no es la frontera (FR-006).
- [ ] B4: sin partner válido ⇒ deny (SC-006, FR-008).

> Si B2 devolviera datos de `banco-b`, o `200`, o `403` con detalle del partner
> ajeno, el aislamiento server-side **falla** y la feature no está lista.
