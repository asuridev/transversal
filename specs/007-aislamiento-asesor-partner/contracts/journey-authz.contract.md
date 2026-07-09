# Contract: Enforcement server-side del journey (aislamiento por partner)

**Feature**: `007-aislamiento-asesor-partner` · **Fase**: 1 · Decisiones: D3, D4, D5
**Cubre**: FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-009, FR-011 ·
**Historias**: US1, US2, US3
**Módulos**: `src/server/security/require-partner-scope.ts`,
`src/server/api/journey-router.ts`, `src/server/api/api-router.ts`,
`src/server/persistence/{audit.ts, sqlite/…}`

Es la **frontera de seguridad efectiva** del aislamiento. Convierte
`POST /api/journey/:slug/*` de "cualquiera opera cualquier slug" a "solo el asesor
del partner correspondiente".

---

## 1. `require-partner-scope.ts` — middleware

```ts
export interface PartnerScopeDeps {
  readonly sessionSeal: Pick<SessionSeal, 'unseal'>;
  readonly isActivePartner: (slug: string) => Promise<boolean>; // findActiveSlugs/​findBySlug
  readonly recordCrossPartnerDenied: (e: {
    actorSub: string; actorName: string; attemptedSlug: string;
  }) => Promise<void>;
}

/** Middleware Express antepuesto a los handlers de journey-router. */
export function requirePartnerScope(deps: PartnerScopeDeps): RequestHandler;
```

Adjunta a la request el partner resuelto para la orquestación:

```ts
declare module 'express-serve-static-core' {
  interface Request { partner?: { id: string; slug: string; actorSub: string; actorName: string }; }
}
```

### Algoritmo (orden estricto)

| Paso | Condición | Respuesta | FR / SC |
|------|-----------|-----------|---------|
| 1 | `bo_session` ausente o `unseal` ⇒ `null` | **401** `unauthorized` | FR-009, SC-002 |
| 2 | sesión sin `partnerSlug` (no es asesor / sin vínculo) | **404** `not_found` (deny sin revelar) | FR-008 |
| 3 | `:slug` (validado) **≠** `session.partnerSlug` | **404** `not_found` + `recordCrossPartnerDenied` | FR-004/005/007, SC-002/005/007 |
| 4 | `session.partnerSlug` ya **no** está activo | **404** `not_found` | FR-003 |
| 5 | ok | `req.partner = {…session}`; `next()` | — |

Notas:

- **Cruce ⇒ `not_found`, no 403** (paso 3): indistinguible de "no existe" ⇒ no
  confirma la existencia del partner ajeno (FR-007, SC-005, edge "enumeración").
- **`recordCrossPartnerDenied` solo en el paso 3** (hubo sesión de asesor y un
  slug ajeno concreto): quién + slug objetivo + cuándo (FR-011). Los pasos 1–2 no
  auditan como acceso cruzado (no hay intento identificable de cruce).
- El `:slug` se sigue validando con `validateSlugParam` (rechazo `invalid_input`
  antes del paso 3 si es sintácticamente inválido).

---

## 2. `journey-router.ts` — orquestación con el partner de la sesión (D4)

```
router.post('/:slug/{*action}',
  requirePartnerScope(deps),          // ← NUEVO: frontera server-side
  async (req, res, next) => {
    // req.partner garantizado por el middleware (paso 5)
    const authoritativeSlug = req.partner.slug;   // ← D4/FR-005: NO se usa req.params.slug
    const result = await orchestrateJourney(
      { slug: authoritativeSlug, action, payload: req.body },
      { secretResolver, masheryClient, requestId: req.requestId });
    …
  });
```

- **El partner de la sesión es autoritativo** (D4, FR-005): la orquestación usa
  `req.partner.slug`, nunca el `:slug` del cliente (que solo sirvió para detectar
  el cruce en el paso 3). Cualquier partner en parámetros/cabeceras/cuerpo se
  ignora.
- El resto del handler (validación de body, mapeo de errores de orquestación) no
  cambia.

### Casos de test (`journey-router.test.ts`)

| Escenario | Esperado |
|-----------|----------|
| Sin cookie de sesión | 401 |
| Sesión admin (sin partner) | 404 |
| Asesor de `banco-a` → `POST /journey/banco-a/…` | 200 (orquesta con `banco-a`) |
| Asesor de `banco-a` → `POST /journey/banco-b/…` | 404 + 1 fila `cross_partner_denied` |
| Asesor de `banco-a` con `banco-a` **inactivo** | 404 |
| Slug sintácticamente inválido | 400 `invalid_input` |
| Cuerpo con `{ partnerId: "banco-b" }` y URL `banco-a` | 200 orquestando `banco-a` (ignora el del body) |

---

## 3. Auditoría de acceso cruzado (D5) — append inmutable

`recordCrossPartnerDenied` inserta en `audit_log` (append-only):

```jsonc
{ "entity": "access", "entityId": "banco-b",           // slug objetivo del cruce
  "action": "cross_partner_denied",
  "actorSub": "u-123", "actorName": "Ana Ruiz",
  "at": "2026-07-06T12:34:56.000Z" }
```

- **Ampliación aditiva** del `CHECK` de `entity`/`action` (ver `data-model.md` §6);
  no relaja la inmutabilidad (solo `INSERT`).
- Método nuevo en el adaptador SQLite (p. ej.
  `sqlite-partner-repository.appendAccessDenied(...)` o una función de `audit.ts`);
  **append simple**, sin transacción de mutación (no hay mutación).
- **Test**: tras un intento de cruce, existe **exactamente una** fila con esos
  campos; no se puede `UPDATE`/`DELETE` (no hay ruta que lo permita).

---

## 4. Wiring (`api-router.ts` / `server.ts`)

- `createJourneyRouter(deps)` recibe además `sessionSeal`, `isActivePartner`
  (derivado de `partnerRepository.findActiveSlugs`/`findBySlug`) y
  `recordCrossPartnerDenied` (auditoría).
- `server.ts` (composition root) construye estas deps a partir de las piezas ya
  existentes (`createSessionSeal`, `partnerRepository`) — sin dependencias nuevas.

---

## Resumen de códigos de respuesta

| Situación | Código | Cuerpo |
|-----------|:------:|--------|
| Sin sesión válida | 401 | `unauthorized` |
| Sesión sin partner / partner inactivo / **cruce** | 404 | `not_found` (indistinguible) |
| Slug inválido | 400 | `invalid_input` |
| Asesor operando su propio partner | 200 | resultado de orquestación |

> El aislamiento es **server-side y no depende del front** (FR-006): aunque el
> guard `partnerScopeMatch` del cliente se saltara, estos códigos se aplican igual.
