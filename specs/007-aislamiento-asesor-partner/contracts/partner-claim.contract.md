# Contract: Derivación del claim de partner + sesión extendida

**Feature**: `007-aislamiento-asesor-partner` · **Fase**: 1 · Decisiones: D1, D2
**Cubre**: FR-001, FR-008, FR-010 · **Módulos**:
`src/server/security/partner-claim.ts`, `src/server/security/session-seal.ts`,
`src/server/api/auth-router.ts`

Define cómo el BFF deriva el partner del asesor desde el IdP y lo sella en la
sesión. Espeja el patrón de `role-map.ts` de `006`.

---

## 1. `partner-claim.ts` — derivación config-driven

```ts
export interface PartnerClaimConfig {
  readonly partnerClaimPath: string;  // PARTNER_CLAIM_PATH
}

/** Lee el claim de partner por path. Devuelve el slug único, o null. */
export function derivePartnerRef(claims: unknown, cfg: PartnerClaimConfig): string | null;

/** Carga la config desde entorno (default path: "partner"). */
export function loadPartnerClaimConfigFromEnv(env?: NodeJS.ProcessEnv): PartnerClaimConfig;
```

### Reglas de `derivePartnerRef`

| Valor del claim (`claims[path]`)     | Resultado    | Motivo |
|--------------------------------------|--------------|--------|
| `"banco-a"` (string no vacío)        | `"banco-a"`  | pertenencia única |
| `["banco-a"]` (array de 1)           | `"banco-a"`  | pertenencia única |
| ausente / `undefined` / `null` / `""`| `null`       | sin partner ⇒ deny (FR-008) |
| `["banco-a","banco-b"]` (>1)         | `null`       | múltiple ⇒ inconsistente (FR-008) |
| tipo no string (número, objeto)      | `null`       | inválido |

- **No hardcode**: el path viene de `PARTNER_CLAIM_PATH` (D1). Resuelto
  **server-side** (el cliente no puede influir).
- La **normalización** del slug (minúsculas/trim) reutiliza `validateSlugParam`/
  `slug-validation` si el valor requiere saneo antes de comparar.

### Casos de test (`partner-claim.test.ts`)

- string único ⇒ slug; array de 1 ⇒ slug; ausente ⇒ null; vacío ⇒ null;
  array >1 ⇒ null; tipo inválido ⇒ null; path anidado (p. ej. `"attrs.partner"`)
  ⇒ lee correctamente (misma mecánica que `readClaimPath` de `role-map`).

---

## 2. `session-seal.ts` — `SealedSession` extendida

```ts
interface SealedSession {
  readonly sub: string;
  readonly name: string;
  readonly roles: AppRole[];
  readonly partnerId?: string;    // NUEVO
  readonly partnerSlug?: string;  // NUEVO
  readonly iat: number;
  readonly exp: number;
}
```

- `seal`/`unseal` no cambian de forma (serializan el objeto completo); los campos
  opcionales viajan cifrados. `unseal` sigue devolviendo `null` si expiró o el
  AEAD no valida.
- **Test** (`session-seal.test.ts`): round-trip de una sesión **con** partner y
  **sin** partner; manipular el ciphertext ⇒ `null`; `exp` vencido ⇒ `null`.

---

## 3. `auth-router.ts` — callback OIDC: derivar, validar y sellar el partner

En `GET /api/auth/callback`, tras `exchangeAuthorizationCode` y `deriveRoles`:

```
partnerRef = derivePartnerRef(claims, partnerClaimConfig)
if partnerRef != null:
    partner = await partnerRepository.findBySlug(partnerRef)
    if partner == null OR partner.status != 'active':
        # FR-008: asesor con partner inexistente/inactivo ⇒ falla segura
        clear tx cookie; redirect 302 -> /forbidden; return
    sealedSession += { partnerId: partner.id, partnerSlug: partner.slug }
# partnerRef == null:
#   - si la identidad ES de asesor (sin rol admin) ⇒ sin partner ⇒ sesión sin
#     partner ⇒ el journey la rechazará (deny). Aceptable: no revela nada.
#   - si es admin de Back Office (006) ⇒ sesión sin partner, comportamiento actual.
seal + Set-Cookie bo_session (igual que 006)
```

### Reglas (FR-001, FR-008, FR-010)

- El partner se **valida contra el catálogo en el login** (existe + `active`).
- Se sella `partnerId` (identidad estable) **y** `partnerSlug` (clave de ruteo).
- **Sin persistencia por usuario**: la pertenencia se re-deriva en cada login
  (FR-010, edge "cambio de pertenencia").
- **Nuevas deps del router**: `partnerClaimConfig: PartnerClaimConfig` y
  `partnerRepository: Pick<PartnerRepository,'findBySlug'>`.

### DTO de sesión extendido (`GET /api/admin/session` → 200)

```jsonc
{ "subject": "u-123", "name": "Ana Ruiz",
  "roles": [], "partnerId": "p-abc", "partnerSlug": "banco-a" }
```

`401` si no hay sesión válida. Ver `front-partner-scope.contract.md`.

### Casos de test (`auth-router.test.ts`, ampliación)

- Asesor con claim de partner **activo** ⇒ sesión sellada con `partnerId/slug`;
  el DTO los expone.
- Asesor con claim de partner **inexistente** ⇒ redirect `/forbidden`, sin cookie
  de sesión.
- Asesor con claim de partner **inactivo** ⇒ idem (deny).
- Claim ausente ⇒ sesión sin partner (no rompe el flujo admin de `006`).
