# Contract — `resolveTenant` y `tenantMatch`

Contrato de la interfaz interna que esta feature expone al resto de la app: la
**función pura de resolución** y el **adaptador de routing** (`CanMatchFn`). Es un
contrato de código (no una API HTTP): define firmas, precondiciones,
postcondiciones y la tabla de comportamiento verificable de forma aislada (FR-011,
SC-006).

---

## 1. `resolveTenant` (función pura)

```ts
function resolveTenant(
  input: TenantInput,
  activeSlugs: ReadonlySet<PartnerSlug>,
): TenantResolution;
```

**Precondiciones**
- `input.pathname` es la ruta de la URL (puede venir con o sin `/` inicial, con o
  sin query/hash — solo se considera el primer segmento del path).
- `activeSlugs` contiene slugs **ya normalizados** (kebab-case) de partners activos.

**Postcondiciones (algoritmo, en orden — research D3)**
1. Sin primer segmento (`/`, `''`) ⇒ `{ kind: 'root' }`.
2. Primer segmento crudo minusculizado ∈ `RESERVED_NAMES` (exacto, case-insensitive,
   **antes** de normalizar) ⇒ `{ kind: 'reserved', area }`.
3. `normalizeSlug(segmento)` es `null` (charset/longitud inválidos) ⇒
   `{ kind: 'fallback', reason: 'unknown-slug' }`.
4. slug normalizado ∈ `activeSlugs` ⇒ `{ kind: 'partner', slug }`; si no ⇒
   `{ kind: 'fallback', reason: 'unknown-slug' }`.

**Propiedades garantizadas**
- **Pura**: sin efectos, sin red, sin `Date.now()`/aleatoriedad.
- **Determinista e idempotente** (FR-010): mismo `(input, activeSlugs)` ⇒ mismo
  resultado; aplicarla dos veces no cambia nada.
- **Sin fugas** (FR-007): nunca devuelve información que distinga "inexistente" de
  "inactivo" hacia afuera (ambos ⇒ `fallback`).

### Tabla de comportamiento (base de los tests unitarios — SC-006)

`activeSlugs = { 'popular', 'otrobanco' }`

| # | `pathname` | Resultado esperado | Requisito |
|---|-----------|--------------------|-----------|
| 1 | `/popular/oferta` | `{ kind: 'partner', slug: 'popular' }` | FR-001, FR-003 |
| 2 | `/popular/beneficiarios` | `{ kind: 'partner', slug: 'popular' }` | FR-001 |
| 3 | `/otrobanco` | `{ kind: 'partner', slug: 'otrobanco' }` | FR-001 |
| 4 | `/` | `{ kind: 'root' }` | FR-004 |
| 5 | `''` | `{ kind: 'root' }` | FR-004 |
| 6 | `/admin` | `{ kind: 'reserved', area: 'admin' }` | FR-005 |
| 7 | `/api/theme/popular` | `{ kind: 'reserved', area: 'api' }` | FR-005 |
| 8 | `/Admin` | `{ kind: 'reserved', area: 'admin' }` | FR-005 (case-insensitive) |
| 9 | `/favicon.ico` | `{ kind: 'reserved', area: 'system' }` | FR-005 (charset no-slug) |
| 10 | `/no-existe/x` | `{ kind: 'fallback', reason: 'unknown-slug' }` | FR-006 |
| 11 | `/inactivo` (existe pero inactivo → no está en activos) | `{ kind: 'fallback', reason: 'unknown-slug' }` | FR-007, SC-003 |
| 12 | `/Popular` (mayúsculas) | `{ kind: 'partner', slug: 'popular' }` | FR-002 (normaliza) |
| 13 | `/ popular ` (espacios) | `{ kind: 'partner', slug: 'popular' }` | FR-002 (trim) |
| 14 | `/pop!ular` (charset inválido) | `{ kind: 'fallback', reason: 'unknown-slug' }` | FR-002 |
| 15 | `/a` (longitud < 2) | `{ kind: 'fallback', reason: 'unknown-slug' }` | FR-002 |
| 16 | `/` + 41 chars (longitud > 40) | `{ kind: 'fallback', reason: 'unknown-slug' }` | FR-002 |

> Casos 8 y 9 verifican que las reservadas se evalúan **sobre el crudo, antes** de
> la normalización (una `/Admin` con mayúscula y una `favicon.ico` con `.` — que no
> cumplen el charset de slug — se reconocen igualmente como reservadas).

---

## 2. `normalizeSlug` (función pura auxiliar)

```ts
function normalizeSlug(raw: string): string | null;
```

- `trim` → `toLowerCase` → validar `^[a-z0-9-]{2,40}$`.
- Devuelve el slug normalizado, o `null` si no cumple (FR-002, D6).
- No lanza; la ausencia de match se representa con `null`.

---

## 3. `tenantMatch` (adaptador de routing — `CanMatchFn`)

```ts
const tenantMatch: CanMatchFn; // (route, segments) => boolean | Promise<boolean>
```

**Comportamiento**
1. Reconstruye el `pathname` desde `segments` del router.
2. Obtiene los activos con `queryClient.ensureQueryData(partnersQueries.activePartners())`
   (caché-o-fetch, TTL — D5).
3. Ejecuta `resolveTenant({ pathname }, activeSlugs)`.
4. Publica el resultado en `TenantStore` (`patchState`) — estado síncrono (D7).
5. Devuelve `true` **solo** si `kind === 'partner'`; en cualquier otro caso `false`
   (la ruta `:partnerSlug` no matchea y el router cae a `**` → `Landing`).

**Fail-safe** (FR-014, D9): si `ensureQueryData` rechaza, se captura, se publica una
resolución `fallback` en el store y se devuelve `false` — indistinguible de un slug
desconocido, sin propagar el error ni emitir señal alguna (observabilidad delegada).

**Restricciones de Constitución**
- Usa `inject(QueryClient)` / `inject(PartnersQueries)` / `inject(TenantStore)` —
  **nunca** `inject(HttpClient)` ni el `*ApiService` directo (Constitución I,
  `ARCHITECTURE.md §3`).
- Guard **funcional** con `inject()` (Constitución III).

**Precedencia de reservadas**: `admin`/`api` se declaran como rutas antes de
`:partnerSlug` en `app.routes.ts`; `tenantMatch` no necesita re-decidir sobre ellas,
pero `resolveTenant` las clasifica correctamente si se le pasa una URL reservada
(defensa en profundidad y reutilización en la validación de alta, FR-012).
