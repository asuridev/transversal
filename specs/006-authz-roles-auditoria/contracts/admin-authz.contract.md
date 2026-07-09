# Contract: Autorización server-side de `/api/admin/*` (RBAC + CSRF)

**Feature**: `006-authz-roles-auditoria`. Refuerza los handlers **ya existentes**
de `src/server/api/admin-router.ts` sin cambiar su forma (el puerto
`AdminAuthGuard` ya está cableado). Ver `research.md` D6/D7/D4.

---

## 1. Autenticación por sesión (reemplaza el default-deny)

`src/server/security/admin-auth-guard.ts` gana un adaptador real:

```ts
export function createSessionAdminAuthGuard(deps: {
  unseal: (raw: string) => SealedSession | null;   // AEAD (D2)
  now?: () => number;
}): AdminAuthGuard;
```

- `authorize({ headers })`: extrae `bo_session` de `Cookie`, la **desella** y
  valida `exp`; ok ⇒ `AdminSession { subject, name, roles }`; falta/expira/
  inválida ⇒ `throw` ⇒ el `requireAdminSession` existente responde **401**
  (FR-007, SC-004). Sin cambios en `admin-router` para esto (D6).
- `src/server.ts` construye este adaptador en lugar de `createAdminAuthGuard()`.

## 2. Autorización por rol (nuevo middleware por endpoint)

```ts
// requireRole(...roles): 403 si la sesión no incluye ninguno (FR-006/007, D7)
function requireRole(...roles: AppRole[]): RequestHandler;
```

Matriz aplicada sobre las rutas actuales de `admin-router.ts`:

| Endpoint | Método | Roles permitidos |
|----------|--------|------------------|
| `/partners` | GET | `platform-admin`, `partner-editor`, `auditor` |
| `/partners/:id` | GET | `platform-admin`, `partner-editor`, `auditor` |
| `/audit` | GET | `platform-admin`, `auditor` |
| `/partners` | POST | `platform-admin`, `partner-editor` |
| `/partners/:id` | PATCH | `platform-admin`, `partner-editor` |
| `/partners/:id/publish` | POST | `platform-admin`, `partner-editor` |
| `/partners/:id/activate` \| `/deactivate` | POST | `platform-admin`, `partner-editor` |
| `/assets` | POST | `platform-admin`, `partner-editor` |
| *(theme default / gestión de admins, si se añade)* | * | `platform-admin` |

- Sin sesión ⇒ **401**; sesión sin rol suficiente ⇒ **403** (FR-007, US2 esc.2/4).
- `auditor` obtiene 403 en toda mutación (US2 esc.1/2, criterio de aceptación
  PRD 06 §7).

## 3. Protección CSRF de mutaciones (D4)

- Middleware `requireCsrf` sobre `POST`/`PATCH` de `/api/admin/*`: compara cookie
  `csrf` con header `X-CSRF-Token`; ausencia o mismatch ⇒ **403** (FR-013).
- `GET` exentos (no mutan). `SameSite=Strict` en ambas cookies como 2ª barrera.

## 4. Orden de middlewares en `/api/admin`

```
requireAdminSession (401)  →  requireCsrf en mutaciones (403)  →  requireRole(...) (403)  →  handler
```

## 5. Actor de auditoría

Los handlers ya usan `req.adminSession?.subject` como actor. Se pasa además
`req.adminSession?.name` como `actorName` al construir la entrada (D8, FR-008).
`unknown` deja de ser aceptable una vez hay sesión real: con guard real siempre
hay `subject`/`name`.

## 6. Invariantes verificables (tests de contrato)

- `GET/POST /api/admin/*` sin `bo_session` ⇒ 401 (SC-004).
- `auditor` en cualquier `POST/PATCH` ⇒ 403 sin efecto (SC-003, US2 esc.2).
- Mutación sin `X-CSRF-Token` válido ⇒ 403 (FR-013).
- Rol desconocido/`[]` ⇒ 403 en todo `/admin/*` (FR-004, US2 esc.4).
</content>
