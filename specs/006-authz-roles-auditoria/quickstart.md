# Quickstart / Validación: AuthZ, Roles y Auditoría (Back Office)

**Feature**: `006-authz-roles-auditoria` · **Fase**: 1. Guía **ejecutable** para
validar la feature end-to-end. No contiene implementación; referencia
`data-model.md` y `contracts/`.

---

## Prerrequisitos

- Node 22+ (usa `node:sqlite` `DatabaseSync`, ya en el repo), npm.
- **podman** + **podman-compose** y `podman login registry.redhat.io`
  (suscripción Red Hat válida) para la imagen `sso76-openshift-rhel8:7.6`.
- Dependencia nueva instalada: `npm i openid-client` (D1).
- Variables de entorno del BFF según `contracts/dev-idp-infra.contract.md` §3.

## Setup del IdP (RH-SSO 7.6 vía podman-compose)

```bash
podman login registry.redhat.io
podman-compose -f infra/sso/podman-compose.yml up -d
# Espera a que RH-SSO arranque e importe el realm `backoffice`:
curl -fsS http://localhost:8080/auth/realms/backoffice/.well-known/openid-configuration | head
```

Usuarios de prueba (realm `backoffice`): `admin-user` (`platform-admin`),
`editor-user` (`partner-editor`), `auditor-user` (`auditor`), `norole-user`
(sin rol).

## Arranque de la app (BFF + SSR)

```bash
npm run build && npm run serve:ssr        # o `npm start` en dev
# BFF en http://localhost:4000  (rutas /api/*), SSR sirve /admin
```

---

## Escenarios de validación (mapeo a User Stories / SC)

### US1 — Acceso autenticado vía SSO (P1) · SC-001, SC-002

1. Navega a `http://localhost:4000/admin` **sin sesión** ⇒ el front detecta
   `GET /api/admin/session` → `401` y redirige a `GET /api/auth/login` ⇒ **302 al
   IdP** (SC-001). *(esc.1)*
2. Autentícate como `editor-user` ⇒ retornas a `/admin` autenticado. *(esc.2)*
3. Abre DevTools → Application/Storage y Network: **solo** existe la cookie
   `bo_session` **httpOnly** (+ `csrf` legible); **no** aparece ningún access/ID
   token del IdP (SC-002). *(esc.3)*
4. Borra/expira `bo_session` (o espera `SESSION_TTL_SECONDS`) y ejecuta una acción
   admin ⇒ `401` y reenvío a login (SC-004). *(esc.4)*

### US2 — Autorización por roles, menor privilegio (P1) · SC-003, SC-004

Con `auditor-user`:
1. `GET /api/admin/partners` y `GET /api/admin/audit` ⇒ `200` (solo lectura).
   *(esc.1)*
2. `POST /api/admin/partners/:id/publish` ⇒ **403**, sin cambios (SC-003).
   *(esc.2)*

Con `editor-user`: crear/editar/publicar branding ⇒ `200/201`; intentar gestión
de theme default / otros admins ⇒ **403**. *(esc.3)*

Con `norole-user`: cualquier `/admin/*` ⇒ **403** (menor privilegio, SC-004
lado 403). *(esc.4)*

Verificación "la UI nunca es la única barrera" (esc.5): llama directamente
`curl -X POST http://localhost:4000/api/admin/partners/<id>/publish` con la cookie
de `auditor-user` ⇒ **403** server-side aun sin pasar por la UI.

CSRF (FR-013): repetir una mutación **sin** header `X-CSRF-Token` (o con valor
distinto a la cookie `csrf`) ⇒ **403**.

### US3 — Auditoría inmutable de mutaciones (P2) · SC-005, SC-006

1. Como `editor-user`, publica un cambio de branding ⇒ `GET /api/admin/audit`
   muestra **exactamente una** entrada nueva con `actorSub`, `actorName`,
   `action:'publish'`, `at`, `diff` (campos→{from,to}) y `themeVersion` resultante
   (SC-005, esc.1).
2. Verifica que **no** existe endpoint ni método para `UPDATE`/`DELETE` de una
   entrada; un intento (test) confirma imposibilidad (SC-006, esc.2).
3. Fuerza el fallo de una mutación (input inválido) ⇒ **no** queda entrada de
   auditoría inconsistente (misma transacción, esc.3).
4. Cada entrada trae identidad técnica (`actorSub`) **y** legible (`actorName`)
   (esc.4).

### US4 — Consulta de auditoría con filtros (P3) · SC-007, SC-008

1. `GET /api/admin/audit?partnerId=<id>` ⇒ solo entradas de ese partner (esc.1).
2. `GET /api/admin/audit?actor=<sub>&from=<ISO>&to=<ISO>` ⇒ intersección AND
   correcta (SC-007, esc.2).
3. Con `norole-user`/`editor-user` sin rol de lectura de auditoría — de hecho
   `partner-editor` **no** está en la matriz de `/audit` ⇒ `GET /api/admin/audit`
   ⇒ **403** (esc.3, FR-011).
4. `GET /api/admin/audit?partnerId=<id>&action=publish&to=<fecha>` ⇒ la primera
   (más reciente) da el `themeVersion` vigente en esa fecha (SC-008, esc.4).

---

## Tests automatizados esperados (ubicación por convención del repo)

- **Server** (`node --test`, `*.test.ts` junto al fuente — `npm run test:server`):
  - `security/session-seal.test.ts` — sellar/desellar AEAD, exp, manipulación ⇒ inválida (D2).
  - `security/session-admin-auth-guard.test.ts` — cookie válida ⇒ `AdminSession`; ausente/expirada ⇒ throw→401 (D6).
  - `security/role-map.test.ts` — claim→rol; sin match ⇒ `[]` (D5).
  - `api/auth-router.test.ts` — login 302, callback emite cookies y descarta token IdP, session 200/401 (auth-api.contract).
  - `api/admin-authz.test.ts` — matriz de roles 401/403/200 + CSRF 403 (admin-authz.contract).
  - `persistence/…/audit filters` — filtros partner/actor/rango; inmutabilidad (audit-api.contract).
- **Front** (Karma + Jasmine, `*.spec.ts`):
  - `core/auth/auth.store.spec.ts` — `hasAnyRole`, `roles[]`.
  - `core/auth/role-guard.spec.ts` — variádico permite/deniega → `/forbidden`.
  - `core/auth/auth-queries.spec.ts` / `auth-api.spec.ts` — `GET /session` (HttpTestingController), `onSuccess`→`setUser`.
  - `core/interceptors/csrf-interceptor.spec.ts` — añade `X-CSRF-Token` en mutaciones `/api/admin/*`.

## Criterios de aceptación PRD 06 §7 (checklist)

- [ ] `/admin` sin sesión → IdP → vuelve autenticado (SC-001).
- [ ] Network sin token del IdP; solo cookie httpOnly (SC-002).
- [ ] `auditor` ve listado/auditoría pero 403 al publicar (SC-003).
- [ ] Publicar crea entrada con diff exacto + versión (SC-005).
- [ ] Entradas de auditoría inmutables (SC-006).
- [ ] `/api/admin/*` sin sesión → 401; con sesión sin rol → 403 (SC-004).
</content>
