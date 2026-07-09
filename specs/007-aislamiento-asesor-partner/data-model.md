# Data Model: Aislamiento de Asesor por Partner (Tenant Isolation)

**Feature**: `007-aislamiento-asesor-partner` · **Fecha**: 2026-07-06 · **Fase**: 1

Deriva de las Key Entities del `spec.md` y de las decisiones de `research.md`
(D1..D8). Distingue **entidades server-side** (BFF/persistencia) de **estado
síncrono de front** (NgRx Signals). No incluye SQL de implementación (vive en el
adaptador, ver `contracts/`). Reutiliza al máximo los modelos de `006`.

---

## 1. `PartnerRef` (referencia de partner del asesor) — derivada del claim

```ts
// src/server/security/partner-claim.ts
type PartnerRef = string; // el SLUG del partner al que pertenece el asesor
```

Reglas (D1, FR-001, FR-008):

- Se lee de `claims[PARTNER_CLAIM_PATH]` server-side (nunca del cliente).
- **Cardinalidad exactamente-uno**: 0 valores ⇒ `null` (sin partner); >1 valores
  ⇒ `null` (inconsistente, no se elige uno). — edge "ausente"/"múltiple".
- **Validación de existencia/estado** en el login: debe existir en el catálogo y
  estar `active` (`PartnerRepository.findBySlug(ref)?.status === 'active'`); si no
  ⇒ el asesor **no** obtiene sesión de partner. — FR-008, edge "inexistente/
  inactivo".
- **Fuente de verdad**: el IdP; re-derivada en cada login (no se persiste por
  usuario) — edge "cambio de pertenencia".

---

## 2. `SealedSession` (sesión sellada) — extiende la de `006`

Extiende `src/server/security/session-seal.ts` con el partner del asesor
(**opcional**: presente ⟺ sesión de asesor; ausente ⟺ admin de Back Office):

```ts
interface SealedSession {
  readonly sub: string;
  readonly name: string;
  readonly roles: AppRole[];
  readonly partnerId?: string;     // NUEVO — identidad estable del partner (D2)
  readonly partnerSlug?: string;   // NUEVO — slug (clave de ruteo/enforcement) (D2)
  readonly iat: number;
  readonly exp: number;
}
```

- **Confidencial + íntegra** (AEAD AES-256-GCM, reutilizado): el cliente no puede
  leer ni alterar `partnerId`/`partnerSlug` (refuerza FR-005; el alcance no se
  toma de datos del cliente).
- **Transporte**: cookie `bo_session` existente — `HttpOnly; Secure;
  SameSite=Strict; Path=/`. El token del IdP nunca viaja (heredado de `006`).
- **Validez**: `exp` absoluto corto (reutilizado); vencida/manipulada ⇒ `unseal`
  ⇒ `null` ⇒ 401.

---

## 3. `AsesorSession` (sesión de asesor resuelta por request)

Vista derivada que el enforcement construye tras desellar (análoga a
`AdminSession` de `006`), garantizando partner presente:

```ts
interface AsesorSession {
  readonly subject: string;    // sub del IdP
  readonly name: string;       // displayName legible (para auditoría)
  readonly partnerId: string;  // NO opcional aquí — el guard exige partner
  readonly partnerSlug: string;
}
```

- La produce `require-partner-scope` **solo** si `SealedSession` trae partner
  válido y activo; en caso contrario no hay `AsesorSession` ⇒ deny.

---

## 4. `PartnerClaimConfig` (config del claim, D1)

```ts
interface PartnerClaimConfig {
  /** Ruta al claim de partner en el token (p. ej. "partner" o "partner_slug"). */
  readonly partnerClaimPath: string;   // PARTNER_CLAIM_PATH
}
```

- Cargado de entorno (`loadPartnerClaimConfigFromEnv`), **no hardcode** (coherente
  con `RoleMapConfig` de `006`). Resuelto server-side (edge "claim manipulado").

---

## 5. `AuditEntry` / `AuditEntity` / `AuditAction` — ampliación aditiva (D5)

Extiende el modelo de `006` (`src/server/persistence/audit.ts`) con el evento de
seguridad de acceso cruzado:

```ts
type AuditEntity = 'partner' | 'partner_theme' | 'access';                 // += 'access'
type AuditAction =
  | 'create' | 'update' | 'publish' | 'deactivate' | 'activate'
  | 'cross_partner_denied';                                                 // += evento seguridad

// Fila del evento de acceso cruzado (FR-011):
// { id, entity:'access', entityId: <slug solicitado>,
//   action:'cross_partner_denied', actorSub, actorName, at }
```

**Invariantes** (no se relajan respecto de `006`):
- **Append-only** (FR-011, SC-007): solo `INSERT`; el evento de acceso cruzado es
  un append más. Nunca `UPDATE`/`DELETE`.
- La regla **transaccional** de `006` (mutación+auditoría en la misma transacción)
  **no aplica** aquí: no hay mutación que envolver, es un registro de acceso
  denegado ⇒ append simple.

---

## 6. Cambios de esquema (`src/server/persistence/sqlite/schema.ts`)

Aditivos, compatibles con datos existentes (idempotente):

```sql
-- Ampliar el CHECK de entity/action de audit_log para admitir el evento de acceso
-- cruzado, manteniendo compatibilidad de lectura con filas previas:
--   entity IN ('partner','partner_theme','access')
--   action IN ('create','update','publish','deactivate','activate','cross_partner_denied')
-- Sin columnas ni tablas nuevas (actor_name/theme_version ya existen desde 006).
-- idx_audit_actor(actor_sub) e idx_audit_at(at) ya existen (cubren consulta del evento).
```

> No hay migración destructiva: el `CHECK` se amplía al (re)crear la tabla
> idempotentemente; las filas históricas siguen siendo válidas.

---

## 7. Estado síncrono de front (NgRx Signals) — extiende `AuthStore`/`AuthUser` (D7)

`src/app/core/auth/auth-model.ts` + `auth.store.ts`:

```ts
interface AuthUser {
  subject: string;
  name: string;
  roles: readonly AppRole[];
  partnerId?: string;      // NUEVO — presente ⟺ asesor
  partnerSlug?: string;    // NUEVO
}

// AuthStore (providedIn:'root', síncrono, Const. §2) gana:
//   partnerId:   computed(() => user()?.partnerId ?? null)     // NUEVO
//   partnerSlug: computed(() => user()?.partnerSlug ?? null)   // NUEVO
```

- Es **estado síncrono** de UI/sesión (Const. §2): reflejo del DTO de
  `GET /api/admin/session`, poblado en el `onSuccess` de la query de sesión (D7).
- El guard `partnerScopeMatch` compara `AuthStore.partnerSlug()` con el tenant
  resuelto en `TenantStore` (PRD 01). No es la frontera de seguridad (D6).

---

## 8. DTO de sesión (contrato front↔BFF) — extendido (D7)

`GET /api/admin/session` → `200`:

```ts
interface SessionDto {
  subject: string;
  name: string;
  roles: AppRole[];
  partnerId?: string;      // NUEVO — solo en sesiones de asesor
  partnerSlug?: string;    // NUEVO
}
```

`401` si no hay sesión válida. El token del IdP nunca viaja; solo el partner ya
resuelto. Ver `contracts/front-partner-scope.contract.md`.

---

## 9. Relaciones

```
IdP (RH-SSO 7.6)
  │  ID/Access token (claims incl. roles + partner) ── validado y DESCARTADO server-side
  ▼
PartnerClaimConfig ──► PartnerRef (slug) ──┐
                                           ├─► findBySlug ⇒ exists & active?  (FR-008)
RoleMapConfig ──► AppRole[] ───────────────┘        │ sí                 │ no ⇒ sin sesión asesor
                                                     ▼
                     SealedSession {…, partnerId, partnerSlug} ──► cookie bo_session (httpOnly)
                                     │
      POST /journey/:slug/*          │
        └─► require-partner-scope ───┤
              1) unseal ⇒ 401 si falta                         (FR-009)
              2) partner en sesión? ⇒ deny si no               (FR-008)
              3) :slug == session.partnerSlug? ⇒ not_found si no (FR-004/005/007)
              4) partner activo? ⇒ deny si no                  (FR-003)
                    │ ok                          │ cruce
                    ▼                             ▼
             orchestrateJourney(              audit_log.append(
               partner = session.partnerSlug)   entity:'access',
                    (D4, FR-005)                 action:'cross_partner_denied') (FR-011)

SessionDto {…, partnerId, partnerSlug} ──► AuthStore.user (front, síncrono)
        └─► partnerScopeMatch (UX) compara con TenantStore (PRD 01)   (D6)
```
