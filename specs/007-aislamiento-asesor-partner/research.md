# Research: Aislamiento de Asesor por Partner (Tenant Isolation)

**Feature**: `007-aislamiento-asesor-partner` · **Fecha**: 2026-07-06 · **Fase**: 0

Resuelve las decisiones técnicas del `plan.md`. No hay `NEEDS CLARIFICATION`
pendientes: la spec fijó los defaults en Assumptions. Cada decisión sigue el
formato **Decisión / Rationale / Alternativas consideradas**.

Contexto de partida (verificado en el código):

- La superficie del asesor es `POST /api/journey/:slug/{*action}`
  (`src/server/api/journey-router.ts`). **Hoy no autentica** y toma el partner
  **del `:slug` del cliente** vía `validateSlugParam` → `orchestrateJourney`. Es
  el hueco de aislamiento que esta feature cierra.
- La sesión sellada (`SealedSession = {sub,name,roles,iat,exp}`,
  `src/server/security/session-seal.ts`) y el callback OIDC
  (`src/server/api/auth-router.ts`) ya existen (PRD 06) y son reutilizables.
- La derivación de claims tiene un patrón canónico: `deriveRoles` +
  `loadRoleMapConfigFromEnv` en `src/server/security/role-map.ts`.
- El catálogo de partners con estado activo/inactivo está en `PartnerRepository`
  (`findBySlug`, `findById`, `findActiveSlugs`) sobre SQLite.
- El `audit_log` inmutable/append-only y transaccional lo aporta PRD 02/06.

---

## D1. Fuente y derivación de la vinculación asesor→partner

**Decisión**: El vínculo asesor→partner se obtiene de un **claim del IdP**
(RH-SSO 7.6), resuelto **server-side** en el callback OIDC mediante un módulo
nuevo `partner-claim.ts` que **espeja `role-map.ts`**:

```ts
// src/server/security/partner-claim.ts
export interface PartnerClaimConfig {
  readonly partnerClaimPath: string;   // PARTNER_CLAIM_PATH, p.ej. "partner" o "partner_slug"
}
/** Devuelve el identificador de partner del claim, o null si ausente/vacío o múltiple. */
export function derivePartnerRef(claims: unknown, cfg: PartnerClaimConfig): string | null;
export function loadPartnerClaimConfigFromEnv(env?: NodeJS.ProcessEnv): PartnerClaimConfig;
```

Reglas (FR-001, FR-008):

- El claim porta el **slug** del partner del asesor (misma clave que enruta el
  journey y que valida `PartnerRepository.findBySlug`).
- **Exactamente uno**: si el claim está ausente, vacío, o resuelve a más de un
  valor ⇒ `null` (el asesor no obtiene partner ⇒ denegado). No se elige uno
  arbitrariamente (edge "vinculación a más de un partner").
- El valor **se valida contra el catálogo** en el login (D1 + FR-008): debe
  existir y estar `active`; si no, falla seguro.

**Rationale**: reutiliza el patrón ya probado de `deriveRoles` (lectura de claim
por path, config de entorno, sin hardcode), es coherente con cómo PRD 06 deriva
roles, y mantiene la fuente de verdad en el IdP (sin persistir la vinculación por
usuario, edge "cambio de pertenencia" ⇒ se re-deriva en el siguiente login).

**Alternativas consideradas**:
- *Tabla de asignación asesor→partner en la BD*: rechazada — duplica la fuente de
  verdad del IdP, exige sincronización y un CRUD extra fuera de alcance; la spec
  no pide gestionar asesores.
- *Claim con `partnerId` (UUID) en vez de slug*: rechazada por ergonomía — el
  slug ya es la clave de ruteo y de `findBySlug`; usar el id obligaría a un lookup
  inverso y a acoplar el realm al id interno. (Se guarda el `partnerId` resuelto
  en la sesión para una identidad estable; ver D2.)
- *Multi-partner por asesor*: fuera de alcance (spec: "exactamente un partner").
  Una identidad multi-partner se trata como inconsistente ⇒ denegada.

---

## D2. Modelo de sesión: extender la sesión sellada existente

**Decisión**: Extender `SealedSession` con **campos opcionales** de partner, sin
crear una cookie ni un stack de sesión paralelos:

```ts
interface SealedSession {
  sub: string; name: string; roles: AppRole[];
  partnerId?: string;    // NUEVO — identidad estable del partner del asesor
  partnerSlug?: string;  // NUEVO — slug (clave de ruteo/enforcement)
  iat: number; exp: number;
}
```

- **Opcionales** porque la misma infraestructura de sesión sirve a dos personas:
  el **admin de Back Office** (PRD 06) **no** tiene partner; el **asesor** tiene
  exactamente uno. `partnerId`/`partnerSlug` presentes ⟺ sesión de asesor.
- Se sellan en la **misma cookie `bo_session`** (AEAD AES-256-GCM ya existente):
  confidencial e íntegra ⇒ el cliente no puede leer ni falsear su partner
  (refuerza FR-005: el alcance no se toma de datos del cliente).

**Rationale**: mínimo blast radius y cero duplicación — reutiliza `sealJson`/
`unsealJson`/`createSessionSeal` y el ciclo del `auth-router`. Sellar el partner
(no solo el slug) evita re-consultar el catálogo para conocer la identidad estable
y liga el alcance a la sesión, no a la URL.

**Alternativas consideradas**:
- *Cookie/sesión separada para asesores*: rechazada — duplicaría sellado, callback
  y whoami sin beneficio; la persona se distingue por la presencia del partner.
- *No sellar el partner y re-derivarlo por request desde el claim*: imposible —
  el token del IdP se descarta tras el login (FR-002 de PRD 06); la sesión es la
  única portadora server-side del partner.

---

## D3. Enforcement server-side en el journey (`require-partner-scope`)

**Decisión**: Nuevo middleware `require-partner-scope.ts` antepuesto en
`journey-router.ts`, que por cada `POST /journey/:slug/*`:

1. **Exige sesión válida** (desella `bo_session`); ausente/expirada ⇒ **401**
   (no autenticado). — FR-009.
2. **Exige partner en la sesión** (`partnerSlug` presente); si falta (p. ej. un
   admin sin partner, o asesor sin vínculo válido) ⇒ **deny (403/404)**. — FR-008.
3. **Compara** el `:slug` de la URL con `session.partnerSlug`. **Distinto** ⇒
   respuesta **indistinguible de "no encontrado"** (`not_found`), sin revelar la
   existencia del partner ajeno. — FR-004/FR-005/FR-007, US2.
4. **Re-verifica que el partner siga activo** por request
   (`findActiveSlugs`/`findBySlug`); inactivo/inexistente ⇒ deny. — FR-003, edge
   "partner desactivado".
5. Adjunta el partner resuelto a la request (`req.partner`) para la orquestación.

**Rationale**: centraliza el aislamiento en un único punto server-side reusable y
testeable; convierte el journey de "cualquiera opera cualquier slug" a "solo el
asesor de ese partner". Tratar el cruce como *not_found* (no 403 explícito) evita
la enumeración de partners ajenos (SC-005).

**Alternativas consideradas**:
- *Enforcement disperso dentro de cada handler/orquestador*: rechazado — propenso
  a olvidos; la frontera debe ser un middleware único e ineludible.
- *Responder 403 en el cruce*: rechazado para lecturas de recurso ajeno porque
  confirma su existencia; se prefiere *not_found* (FR-007). (El caso "sin partner
  en sesión" sí es 403/deny porque no revela nada de otro partner.)

---

## D4. El partner de la sesión es autoritativo (no el `:slug` del cliente)

**Decisión**: Una vez validado el match (D3.3), la orquestación
(`orchestrateJourney`) usa el **partner de la sesión** como slug autoritativo. El
`:slug` de la URL solo sirve para detectar y rechazar el cruce; **nunca** amplía
ni cambia el alcance.

**Rationale**: implementa literalmente FR-005 ("ignora cualquier identificador de
partner del cliente y aplica el de la sesión"). Aunque D3.3 ya exige igualdad, usar
la sesión como fuente elimina toda ambigüedad y cubre futuros vectores (parámetros,
cabeceras o cuerpo con otro partner) con una sola regla.

**Alternativas consideradas**:
- *Confiar en el `:slug` tras validarlo*: equivalente cuando hay match, pero deja
  la puerta a que otro punto del código lea el slug del cliente; se prefiere una
  única fuente (la sesión) por robustez.

---

## D5. Auditoría de accesos cruzados (reusar `audit_log` inmutable)

**Decisión**: Registrar cada intento de acceso cruzado como un **append** en el
`audit_log` de PRD 06, ampliando su vocabulario de forma **aditiva**:

```ts
type AuditEntity = 'partner' | 'partner_theme' | 'access';           // += 'access'
type AuditAction = /* …existentes… */ | 'cross_partner_denied';       // += evento seguridad
```

- Fila: `{ entity:'access', entityId: <slug solicitado>, action:'cross_partner_denied',
  actorSub, actorName, at }` (quién, partner objetivo, cuándo). — FR-011.
- El `CHECK` de `entity`/`action` en `schema.ts` se **amplía** (idempotente,
  compatible con filas previas); **no** se relaja la inmutabilidad: sigue siendo
  solo `INSERT` (append-only), nunca `UPDATE`/`DELETE`.
- Es un **append fuera de transacción de mutación** (no hay mutación que envolver);
  no viola la regla transaccional de PRD 06 (que aplica a mutación+auditoría).

**Rationale**: "traza auditable coherente con la auditoría del Back Office"
(FR-011) ⇒ reutilizar el mismo registro inmutable en lugar de un canal ad-hoc.
Ampliar un `CHECK` es el cambio mínimo y no destructivo.

**Alternativas consideradas**:
- *Solo logs estructurados (`logRequestError`)*: rechazado como único mecanismo —
  no es inmutable ni consultable como auditoría; se mantiene **además** para
  observabilidad operativa.
- *Nueva tabla `security_events`*: rechazada — introduce esquema y superficie de
  consulta nuevos para lo que el `audit_log` ya resuelve.

---

## D6. Guard de front `partnerScopeMatch` (UX, no frontera)

**Decisión**: Guard funcional `partnerScopeMatch: CanMatchFn` que se **encadena
tras `tenantMatch`** (PRD 01) en las rutas del journey: compara el tenant resuelto
(`TenantStore`) con el partner de la sesión (`AuthStore.partnerSlug`); si difieren,
redirige al partner del asesor o a `/forbidden`.

**Rationale**: evita **mostrar** una vista ajena y da feedback inmediato, pero
**no** es la barrera de seguridad — el BFF rechaza igual (D3). Es un guard
funcional que lee stores síncronos (Const. II/III), sin `HttpClient`.

**Alternativas consideradas**:
- *No poner guard de front y depender solo del BFF*: seguro, pero peor UX (el
  usuario vería un error tardío). Se añade el guard como cortesía.
- *Guard como clase/servicio*: rechazado por Const. II (guards funcionales).

---

## D7. DTO de sesión: exponer el partner al front

**Decisión**: `SessionDto` (respuesta de `GET /api/admin/session`) y `AuthUser`
ganan `partnerId?`/`partnerSlug?` (opcionales); `AuthStore` los expone como
señales; `AuthQueries.session()` los vuelca en `onSuccess`.

**Rationale**: el front necesita conocer el partner del asesor para el guard UX y
para enrutar a su vista, sin exponer nunca el token del IdP (solo el partner ya
resuelto). Mantiene el flujo de sesión de PRD 06 (TanStack Query → Store).

**Alternativas consideradas**:
- *Endpoint nuevo `/api/session`*: innecesario — el DTO existente admite los
  campos opcionales.

---

## D8. Infra dev — mapper de claim de partner + usuarios asesor

**Decisión**: Extender el realm de RH-SSO 7.6 (`infra/sso/realm/…`) con un
**protocol mapper** que emita el claim de partner (`PARTNER_CLAIM_PATH`) y con
**usuarios asesor de prueba** vinculados a partners distintos (A y B), con paridad
dev/prod (misma imagen de PRD 06). Variables de entorno: `PARTNER_CLAIM_PATH`.

**Rationale**: permite validar de punta a punta (quickstart) que el asesor A no
accede a B, con el mismo producto de IdP que producción.

**Alternativas consideradas**:
- *Simular el claim solo en tests*: se hace en los unit tests del BFF, pero el
  quickstart requiere el IdP real para la validación E2E del agente.

---

## Resumen de decisiones

| # | Decisión | FR / SC principal |
|---|----------|-------------------|
| D1 | Claim de partner derivado server-side (espeja `role-map`), exactamente-uno, validado contra catálogo | FR-001, FR-008, SC-001/006 |
| D2 | Sesión sellada existente extendida con `partnerId?`/`partnerSlug?` (opcional, cookie única) | FR-001, FR-005 |
| D3 | Middleware `require-partner-scope` en el journey (401 sin sesión, cruce⇒not-found, inactivo⇒deny) | FR-003/004/007/009, SC-002/005 |
| D4 | Partner de la sesión autoritativo; slug del cliente nunca amplía alcance | FR-005, SC-004 |
| D5 | Auditoría de acceso cruzado append-only en `audit_log` (CHECK ampliado, aditivo) | FR-011, SC-007 |
| D6 | Guard de front `partnerScopeMatch` (UX, no frontera) | FR-002, US1 |
| D7 | DTO de sesión + `AuthUser`/`AuthStore` exponen el partner | FR-002 |
| D8 | Realm dev: mapper de claim + usuarios asesor A/B (paridad prod) | quickstart |

**Cero dependencias npm nuevas.** Todas las decisiones reutilizan infraestructura
de `001`/`002`/`006` y añaden únicamente enforcement server-side + wiring de front.
