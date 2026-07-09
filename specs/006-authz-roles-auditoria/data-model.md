# Data Model: AuthZ, Roles y Auditoría (Back Office)

**Feature**: `006-authz-roles-auditoria` · **Fecha**: 2026-07-05 · **Fase**: 1

Deriva de las Key Entities del `spec.md` y de las decisiones de `research.md`
(D1..D12). Distingue **entidades server-side** (BFF/persistencia) de **estado
síncrono de front** (NgRx Signals). No incluye SQL de implementación (vive en el
adaptador, ver `contracts/`).

---

## 1. `AppRole` (rol de aplicación) — valor cerrado

```ts
type AppRole = 'platform-admin' | 'partner-editor' | 'auditor';
```

Reglas (PRD 06 §3, FR-005):

| Rol | Lectura partners/auditoría | Crear/editar/publicar branding | Theme default / otros admins |
|-----|:--:|:--:|:--:|
| `platform-admin` | ✅ | ✅ | ✅ |
| `partner-editor` | ✅ | ✅ | ❌ (403) |
| `auditor` | ✅ (solo lectura) | ❌ (403) | ❌ (403) |

- Derivado por el BFF desde claims del IdP vía `ROLE_MAP` (D5). Sin rol
  mapeable ⇒ `roles: []` ⇒ 403 en toda superficie admin (menor privilegio,
  FR-004).
- **Fuente de verdad**: el IdP, re-derivado en cada login (FR-014). No se
  persiste por usuario.

---

## 2. `AdminSession` (sesión sellada, server-side) — extiende el puerto existente

Extiende `src/server/security/admin-auth-guard.ts` (`AdminSession` actual:
`{ subject, roles }`) con `name` para la auditoría legible (D6, FR-008):

```ts
interface AdminSession {
  readonly subject: string;        // `sub` del IdP (identificador técnico)
  readonly name: string;           // displayName legible (FR-008) — NUEVO
  readonly roles: readonly AppRole[];
}
```

**Payload sellado en la cookie** (AEAD AES-256-GCM, D2). NO contiene el token del
IdP (FR-002):

```ts
interface SealedSession {
  sub: string;
  name: string;
  roles: AppRole[];
  iat: number;   // epoch s
  exp: number;   // epoch s (iat + SESSION_TTL_SECONDS, D3)
}
```

- **Confidencial + íntegra**: cifrada; el cliente no puede leer ni alterar
  `roles` (SC-002, edge "claim manipulado").
- **Validez**: `exp` absoluto corto (D3). Vencida/manipulada ⇒ `authorize()`
  lanza ⇒ 401 (SC-004).
- **Transporte**: cookie `bo_session` — `HttpOnly; Secure; SameSite=Strict;
  Path=/` (FR-002, edge "sesión robada XSS").

---

## 3. `CsrfToken` (double-submit) — server-side + cookie legible

```ts
// Cookie `csrf` (NO httpOnly, SameSite=Strict) — legible por el front (D4)
// Header `X-CSRF-Token` reenviado por el front en cada mutación admin
type CsrfToken = string; // crypto.randomBytes(32).toString('base64url')
```

- Emitido junto con la sesión en el callback OIDC. En cada mutación admin el BFF
  compara cookie `csrf` vs header `X-CSRF-Token`; distinto/ausente ⇒ 403
  (FR-013).

---

## 4. `RoleMapConfig` (mapeo claim→rol, config del BFF, D5)

```ts
interface RoleMapConfig {
  /** Ruta al claim de roles en el ID/Access token (p. ej. "realm_access.roles"). */
  roleClaimPath: string;                 // ROLE_CLAIM_PATH
  /** claim del IdP → rol de aplicación. No incluido ⇒ ignorado (menor privilegio). */
  roleMap: Readonly<Record<string, AppRole>>;   // ROLE_MAP (JSON)
}
```

- Cargado de entorno; **no hardcode** (FR-004). Resuelto server-side (edge "claim
  manipulado").
- Derivación: `claims[roleClaimPath] → map → dedupe → AppRole[]`. Vacío ⇒ `[]`.

---

## 5. `AuditEntry` (entrada de auditoría) — enriquecida (D8)

Extiende `src/server/persistence/audit.ts` (actual:
`{ id, entity, entityId, action, actorSub, diff?, at }`) con `actorName`,
`themeVersion?` y estructura del `diff` (FR-008, FR-012):

```ts
type AuditEntity = 'partner' | 'partner_theme';
type AuditAction = 'create' | 'update' | 'publish' | 'deactivate' | 'activate';
//                                  ▲ alias de dominio de 'save_version' del repo (ver nota)

interface AuditEntry {
  id: string;                 // UUID (default en createAuditEntry)
  entity: AuditEntity;
  entityId: string;           // id de partner o de partner_theme
  action: AuditAction;
  actorSub: string;           // `sub` del IdP (técnico, FR-008)
  actorName: string;          // displayName legible (FR-008, US3 esc.4) — NUEVO
  diff?: string;              // JSON de AuditDiff serializado
  themeVersion?: number;      // versión resultante si aplica (FR-012, US3 esc.1) — NUEVO
  at: string;                 // ISO-8601 (default en createAuditEntry)
}

/** Diff concreto campo → antes/después (FR-008, US3 esc.1). */
type AuditDiff = Record<string, { from: unknown; to: unknown }>;
```

**Nota de nomenclatura (D8)**: PRD 06 usa `update`; el repo actual emite
`save_version`. Se adopta el vocabulario de PRD 06 en el modelo
(`create|update|publish|deactivate|activate`) y se mapea `save_version →
update` en la capa de auditoría, sin romper el `CHECK` del schema (se amplía, ver
§7).

**Invariantes**:
- **Append-only** (FR-009, SC-006): solo `INSERT`; nunca `UPDATE`/`DELETE` sobre
  `audit_log`. Verificable: no existe ruta ni método que los ejecute.
- **Transaccional** (FR-010, US3 esc.3): la fila se escribe en la MISMA
  transacción que la mutación (ya garantizado por el adaptador `PartnerRepository`;
  esta feature no lo relaja).

---

## 6. `AuditQuery` (filtros de consulta, D9)

Extiende `AuditQuery` (`{ limit?, offset? }`) de
`src/server/persistence/partner-repository.ts`:

```ts
interface AuditQuery {
  entityId?: string;   // filtro por partner (US4 esc.1) — NUEVO
  actorSub?: string;   // filtro por actor (US4 esc.2) — NUEVO
  from?: string;       // ISO-8601 inclusive (rango de fechas) — NUEVO
  to?: string;         // ISO-8601 inclusive — NUEVO
  limit?: number;
  offset?: number;
}
```

- Resultado ordenado por `at` DESC. Los filtros combinan con AND (US4 esc.2).
- Reconstrucción "marca vigente en fecha X" (SC-008, US4 esc.4): consulta
  derivada = última entrada `publish` de ese partner con `at <= X`, cuyo
  `themeVersion` identifica la `partner_themes.version` vigente. Sin nueva
  entidad.

---

## 7. Cambios de esquema (`src/server/persistence/sqlite/schema.ts`)

Aditivos, compatibles con datos existentes (FR-009 no se viola: sigue sin
UPDATE/DELETE):

```sql
ALTER TABLE audit_log ADD COLUMN actor_name    TEXT;     -- FR-008 (nullable para filas previas)
ALTER TABLE audit_log ADD COLUMN theme_version INTEGER;  -- FR-012 (nullable)

-- El CHECK de `action` se amplía al vocabulario PRD 06 al (re)crear la tabla:
--   action IN ('create','update','publish','deactivate','activate')
-- manteniendo compatibilidad de lectura con filas 'save_version' históricas.

-- Índices para los filtros de D9 (US4):
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_sub);
CREATE INDEX IF NOT EXISTS idx_audit_at    ON audit_log(at);
-- idx_audit_entity(entity, entity_id) ya existe (cubre filtro por partner).
```

> `SCHEMA_SQL` es idempotente (`CREATE TABLE IF NOT EXISTS`). Las columnas nuevas
> se añaden con guardas `ADD COLUMN` tolerantes a "duplicate column" para no
> requerir migración destructiva (V1 dev usa `partners.db` local + Litestream).

---

## 8. Estado síncrono de front (NgRx Signals) — extiende seams existentes (D10)

`src/app/core/auth/auth.store.ts` (`AuthUser` actual: `{ subject, role }`):

```ts
interface AuthUser {
  subject: string;
  name: string;                        // legible — NUEVO
  roles: readonly AppRole[];           // era `role: string` — CAMBIO a lista
}

// AuthStore (providedIn:'root', síncrono, Const. §2) gana:
//   isAuthenticated: computed(() => user() !== null)           // ya existe
//   hasAnyRole(...roles: AppRole[]): boolean                    // NUEVO (para roleGuard)
```

- Es **estado síncrono** de UI/sesión (Const. §2): reflejo de lo que
  `GET /api/admin/session` reporta, poblado en el `onSuccess` de la query de
  sesión (D10). **No** guarda datos de servidor cacheables (eso es TanStack
  Query).
- `AppRole` de front = mismo unión que §1 (tipo compartido en
  `src/app/core/auth/auth-model.ts`, o reusado desde `shared/` si un 2º feature lo
  necesita — regla de promoción ARCHITECTURE §1).

---

## 9. DTO de sesión (contrato front↔BFF)

`GET /api/admin/session` → `200`:

```ts
interface SessionDto {
  subject: string;
  name: string;
  roles: AppRole[];   // roles de aplicación ya mapeados; el token del IdP nunca viaja
}
```

`401` si no hay sesión válida (front inicia login). Ver `contracts/auth-api.contract.md`.

---

## 10. Relaciones

```
IdP (RH-SSO 7.6)
  │  ID/Access token (claims incl. roles)  ── validado y DESCARTADO server-side
  ▼
RoleMapConfig ──► AppRole[] ──► SealedSession ──► cookie bo_session (httpOnly)
                                     │
                                     ├─► AdminSession (por request, en el BFF)
                                     │        └─► RBAC por endpoint (D7)
                                     └─► SessionDto ──► AuthStore.user (front, síncrono)

Mutación admin (create|update|publish|deactivate|activate)
  └─(misma transacción)─► AuditEntry ──► audit_log (append-only)
                                            │  themeVersion ↔ partner_themes.version
                                            ▼
                                    AuditQuery (filtros) ──► GET /api/admin/audit
```
</content>
