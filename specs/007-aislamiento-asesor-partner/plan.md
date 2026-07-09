# Implementation Plan: Aislamiento de Asesor por Partner (Tenant Isolation)

**Branch**: `007-aislamiento-asesor-partner` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-aislamiento-asesor-partner/spec.md`

## Summary

Esta feature cierra el **aislamiento multi-tenant del asesor**: garantiza que un
asesor vinculado al partner A **solo** pueda ver y operar la superficie y los
datos del partner A, y **nunca** los de otro partner, con la frontera de
seguridad **del lado servidor** (petición explícita del usuario).

El hallazgo nuclear que motiva el diseño: hoy la superficie del asesor —
`POST /api/journey/:slug/*` (`src/server/api/journey-router.ts`) — **no
autentica y toma el partner íntegramente del `:slug` que envía el cliente**. Un
asesor podría cambiar el slug y operar el journey de otro partner. Esta feature
introduce la frontera que faltaba.

Enfoque técnico (reutiliza al máximo la infraestructura de **PRD 04/06**, cero
dependencias npm nuevas):

1. **Claim de partner → `partnerId`/`partnerSlug`, derivado server-side** (D1):
   nuevo módulo `partner-claim.ts` que **espeja `role-map.ts`** — lee un claim del
   IdP (`PARTNER_CLAIM_PATH`) y resuelve **exactamente un** partner; 0 o >1 ⇒ sin
   partner (menor privilegio, FR-008).
2. **Sesión sellada extendida** (D2): `SealedSession` gana `partnerId?` +
   `partnerSlug?` (opcionales — un platform-admin de Back Office no tiene
   partner; un asesor tiene exactamente uno). Reutiliza el sellado AEAD y la
   cookie `bo_session` existentes; el token del IdP sigue sin llegar al cliente.
3. **Validación de partner en el login** (D1/FR-008): el callback OIDC valida
   contra `PartnerRepository.findBySlug` que el partner del asesor **existe y está
   activo**; si no, falla seguro (sin sesión de asesor).
4. **Enforcement server-side en el journey** (D3): nuevo middleware
   `require-partner-scope.ts` que (a) exige sesión válida (401 si falta),
   (b) deriva el partner **de la sesión**, (c) **ignora/rechaza** cualquier slug
   del cliente que difiera del de la sesión tratándolo como *no encontrado*
   (FR-004/005/007, sin enumeración), y (d) re-verifica que el partner siga
   **activo** por request (FR-003, edge "partner desactivado"). La orquestación
   usa el partner **de la sesión** como autoritativo, no el de la URL.
5. **Auditoría de accesos cruzados** (D5): reutiliza el `audit_log` inmutable y
   append-only de PRD 06, ampliando su vocabulario con un evento de seguridad
   (`entity:'access'`, `action:'cross_partner_denied'`) — traza auditable
   coherente con el Back Office (FR-011).
6. **Wiring de front como UX, no frontera** (D6/D7): `AuthUser` y el DTO de sesión
   ganan `partnerId?`/`partnerSlug?`; un guard funcional `partnerScopeMatch`
   compara el tenant resuelto por PRD 01 (`TenantStore`) con el partner de la
   sesión (`AuthStore`) y redirige en caso de desajuste. La seguridad real vive en
   el BFF; el front solo evita mostrar una vista ajena.
7. **Infra dev** (D8): el realm de RH-SSO 7.6 (`infra/sso/`) gana un **mapper de
   claim de partner** y usuarios asesor de prueba vinculados a partners distintos,
   con paridad dev/prod (misma imagen que PRD 06).

Alcance = **claim de partner + sesión extendida + enforcement server-side del
journey + auditoría de accesos cruzados + wiring de front (UX) + mapper/usuarios
en el realm dev**. Quedan **fuera**: el flujo OIDC base y la sesión sellada (son
`006`, se reutilizan), la resolución de tenant del front para theming (es `001`,
se reutiliza), el modelo de partner/theme (es `002`) y el Back Office admin
(`005`/`006`, cuyos roles no son partner-scoped). Esta feature **consume** esas
superficies y añade la dimensión de aislamiento por partner.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict). **BFF** Node 22+ / Express 5
(`src/server/`, ESM `.ts` vía `--experimental-strip-types`). **Front** Angular
20.3 (standalone, zoneless, signals), mismo SSR de `003`.

**Primary Dependencies**:
- **Ninguna dependencia npm nueva.** Se reutiliza todo lo de `006`:
  `openid-client` v6 (flujo OIDC ya existente), `node:crypto` (sellado de
  sesión), `node:sqlite` (`audit_log`), `express` (routers).
- **Front (ya presente)**: `@tanstack/angular-query-experimental` (sesión),
  `@ngrx/signals` (`AuthStore`, `TenantStore`), `@angular/router` (guards
  funcionales), Tailwind v4.
- **Consumido de otras features (reuso, no reimplementación)**: `session-seal.ts`,
  `auth-router.ts` (callback OIDC), `role-map.ts` (patrón de derivación de claim),
  `admin-auth-guard.ts` (sellado/desellado de sesión) — todo de `006`;
  `PartnerRepository.findBySlug`/`findActiveSlugs` + `audit_log` de `002`;
  `TenantStore`/`resolve-tenant`/`tenant-guard` de `001`; `AuthStore`/`auth-model`
  de `006`.

**Storage**: SQLite (`partners.db`) vía `node:sqlite`, adaptador
`PartnerRepository` existente. Cambio **aditivo** en `audit_log`: ampliación del
`CHECK` de `entity`/`action` para admitir el evento de acceso cruzado (D5); **sin
tablas ni columnas nuevas** (las columnas `actor_name`/`theme_version` de `006` ya
existen). **Sin session store** (sesión sellada stateless, reutilizada). El claim
de partner se resuelve a `partnerId` en el login y se sella en la cookie.

**Testing**: **Server** — `node --test` (`*.test.ts` junto al fuente,
`npm run test:server`): derivación del claim de partner (0/1/>1, ausente,
inexistente, inactivo), extensión del sellado de sesión, middleware
`requirePartnerScope` (match, mismatch⇒not-found, sin sesión⇒401, partner
inactivo⇒deny), enforcement del journey-router, append de auditoría de acceso
cruzado. **Front** — Karma + Jasmine (`*.spec.ts`, ARCHITECTURE §9): `AuthStore`
(`partnerId`), guard `partnerScopeMatch`, DTO de sesión. Playwright CLI =
verificación manual del agente (asesor A no ve B).

**Target Platform**: BFF Node/Express en `http://localhost:4000` (dev); IdP
RH-SSO 7.6 en contenedor podman. Front: navegador (SPA hidratada por SSR), datos
mismo-origen tras `/api/*`.

**Project Type**: Aplicación web Angular de proyecto único con **BFF Express +
SSR**. El código nuevo vive en `src/server/security/` y `src/server/api/`
(enforcement), y `src/app/core/auth` + `src/app/core/tenant` (front UX); infra en
`infra/sso/`.

**Performance Goals**: Overhead por request de journey ≈ desellado AEAD de la
sesión (sub-milisegundo, en proceso) + comparación de slug + verificación de
partner activo contra un conjunto cacheable (`findActiveSlugs`, ya usado por
`001`). Derivación del claim de partner **una vez por login**. Sin metas de
throughput específicas.

**Constraints**:
- **Seguridad del lado servidor** (objetivo declarado, FR-003/004): la UI nunca
  es la única frontera; cada request de journey re-verifica sesión + partner
  server-side.
- **El partner de la sesión es autoritativo** (FR-005): cualquier slug/identificador
  de partner suministrado por el cliente que difiera se ignora o rechaza; nunca
  amplía el alcance.
- **Recurso ajeno = no encontrado** (FR-007): el acceso cruzado es indistinguible
  de "no existe" (sin enumeración).
- **Menor privilegio por defecto** (FR-008): identidad sin **exactamente un**
  partner válido (ausente/múltiple/inexistente/inactivo) ⇒ denegación.
- **Token del IdP nunca en el cliente** (heredado de `006`): solo cookie sellada
  httpOnly; el partner se deriva de claims server-side y se sella.
- **Auditoría append-only e inmutable** (FR-011): el evento de acceso cruzado se
  **anexa**; no se relaja la inmutabilidad de `audit_log`.
- **Const. I–IV (front)**: sesión (incl. `partnerId`) vía TanStack Query →
  `AuthStore` síncrono; guard funcional; sin `HttpClient` en guards/componentes;
  sin axios; standalone + OnPush; `inject()`; Tailwind único; zoneless.

**Scale/Scope**: BFF — 2 módulos de seguridad nuevos (`partner-claim`,
`require-partner-scope`), extensión de `session-seal` (+2 campos), de `auth-router`
(derivar/validar/sellar partner + DTO), de `journey-router` (enforcement +
orquestación por partner de sesión), de `api-router`/`server.ts` (wiring), de
`audit`/`schema`/`sqlite-partner-repository` (evento de acceso cruzado). Front —
extensión de `auth-model`/`AuthStore`/DTO de sesión, 1 guard `partnerScopeMatch`.
Infra — mapper de claim de partner + usuarios asesor en el realm. **0 dependencias
npm nuevas.**

## Constitution Check

*GATE: Debe pasar antes de Phase 0. Re-evaluado tras Phase 1 (ver final).*

La Constitución (I–IV) gobierna la **UI Angular**. Esta feature es
mayoritariamente **BFF Node/Express** (enforcement server-side), fuera del alcance
directo de I–IV; el BFF sigue sus patrones ya establecidos en `src/server/`
(routers/middlewares Express, puertos/adaptadores, `node:sqlite`). Las **piezas de
front** se evalúan contra cada principio:

**I. Estado y Datos — Separación Síncrono/Asíncrono** — ✅ CUMPLE
- **Sin `axios`**: el BFF deriva el partner de claims (sin HTTP saliente nuevo);
  el front lee la sesión con `HttpClient` envuelto en `AuthApiService`/`AuthQueries`
  (patrón `006`).
- **TanStack Query = único estado de servidor**: `partnerId`/`partnerSlug` llegan
  en el DTO de sesión (`GET /api/admin/session`) resuelto por `AuthQueries.session()`
  y volcado al `AuthStore` en `onSuccess`. Ningún guard/componente inyecta
  `HttpClient`.
- **NgRx SignalStore solo síncrono**: `AuthStore`/`TenantStore` guardan sesión y
  tenant resuelto (estado síncrono de UI), no datos de API cacheables.

**II. Componentes Standalone y OnPush** — ✅ CUMPLE
- No se añaden componentes de UI (se reutiliza `forbidden` de `005`, standalone +
  OnPush). El nuevo `partnerScopeMatch` es un guard **funcional** (`CanMatchFn`),
  no una clase. Sin `ngClass`/`ngStyle`, sin `@HostBinding`/`@HostListener`.

**III. Inyección de Dependencias** — ✅ CUMPLE
- `inject()` en el guard y en `AuthStore`/`TenantStore`/`AuthQueries`
  (`providedIn:'root'`). Sin inyección por constructor.

**IV. Estilos y Zoneless** — ✅ CUMPLE
- No se introduce CSS/librería nueva (Tailwind único). Reactividad por signals +
  `OnPush`; el guard no usa `NgZone`/`zone.js`.

**Decisiones nuevas que la Constitución no cubre explícitamente** (detalladas en
`research.md`, ninguna en conflicto con I–IV — todas server-side): D1 claim de
partner, D2 sesión extendida, D3 middleware de scope, D4 partner de sesión
autoritativo, D5 auditoría de acceso cruzado. **Cero dependencias npm nuevas**;
ninguna prohibición del front se toca.

**Resultado del gate**: **PASA** sin violaciones. **Complexity Tracking** vacía.

## Project Structure

### Documentation (this feature)

```text
specs/007-aislamiento-asesor-partner/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Phase 0 — decisiones D1..D8 y alternativas
├── data-model.md        # Phase 1 — sesión extendida, claim de partner, evento de auditoría
├── quickstart.md        # Phase 1 — validación ejecutable (asesor A no accede a B)
├── contracts/           # Phase 1
│   ├── partner-claim.contract.md      # claim→partner + sesión extendida — FR-001/008/010, D1/D2
│   ├── journey-authz.contract.md      # enforcement server-side del journey — FR-002..007/011, US1/US2/US3
│   └── front-partner-scope.contract.md # DTO de sesión + guard UX — FR-002, US1, D6/D7
├── checklists/          # (existente) calidad de la spec
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Nuevo enforcement de partner en `src/server/security/`; extensión del journey y
del auth-router en `src/server/api/`; ampliación mínima de la auditoría en
`src/server/persistence/`; wiring de front (UX) en `src/app/core/`; infra en
`infra/sso/`. Se **reutilizan** los seams de `001`/`002`/`006`.

```text
src/
  server/
    security/
      partner-claim.ts               # NUEVO — derivePartner(claims,cfg) + loadPartnerClaimConfigFromEnv (D1, espeja role-map.ts)
      partner-claim.test.ts          # NUEVO — 0/1/>1, ausente, inexistente, inactivo
      require-partner-scope.ts       # NUEVO — middleware: sesión⇒401, mismatch⇒not-found, inactivo⇒deny (D3, FR-004/005/007)
      require-partner-scope.test.ts  # NUEVO
      session-seal.ts                # EDITAR — SealedSession += partnerId?, partnerSlug? (D2)
      session-seal.test.ts           # EDITAR — round-trip con partner
      admin-auth-guard.ts            # EDITAR — AdminSession/session expone partnerId? (opcional)
    api/
      auth-router.ts                 # EDITAR — derivar+validar+sellar partner en callback; DTO de sesión += partner (D1/D2/D7, FR-008)
      auth-router.test.ts            # EDITAR — asesor con/ sin partner válido
      journey-router.ts              # EDITAR — anteponer requirePartnerScope; orquestar con partner de sesión (D3/D4, FR-002..007)
      journey-router.test.ts         # NUEVO — asesor A ⇒ B rechazado como not-found; sin sesión ⇒ 401
      api-router.ts                  # EDITAR — pasa sessionSeal/partnerRepo/audit deps al journey-router
    persistence/
      audit.ts                       # EDITAR — AuditEntity += 'access'; AuditAction += 'cross_partner_denied' (D5)
      sqlite/schema.ts               # EDITAR — ampliar CHECK entity/action (aditivo, idempotente) (D5)
      sqlite/sqlite-partner-repository.ts  # EDITAR — appendAccessDenied(...) (append-only, sin transacción de mutación)
    server.ts                        # EDITAR — composition root: loadPartnerClaimConfigFromEnv + deps del journey guard
  app/
    core/
      auth/
        auth-model.ts                # EDITAR — AuthUser += partnerId?, partnerSlug? (D7)
        auth.store.ts                # EDITAR — exponer partnerId()/partnerSlug() (síncrono)
        auth.store.spec.ts           # EDITAR
      tenant/
        partner-scope-guard.ts       # NUEVO — partnerScopeMatch: TenantStore.slug vs AuthStore.partnerSlug (D6, UX)
        partner-scope-guard.spec.ts  # NUEVO
    features/auth/queries/auth-queries.ts   # EDITAR — SessionDto += partner (poblar AuthStore.partner)
    features/auth/services/auth-api.ts      # EDITAR — tipo de respuesta de /session
    app.routes.ts / *.routes.ts      # EDITAR — encadenar partnerScopeMatch tras tenantMatch en rutas de journey
infra/
  sso/
    realm/backoffice-realm.json      # EDITAR — protocol mapper de claim de partner + usuarios asesor (partner A/B) (D8)
```

Notas de estructura:
- **`partner-claim.ts` espeja `role-map.ts`** (misma forma `readClaimPath` +
  `deriveX` + `loadXFromEnv`): coherencia y tests análogos, mínimo aprendizaje.
- **El partner de la sesión es la fuente autoritativa** (D4): `journey-router`
  deja de confiar en `:slug` del cliente para el alcance; lo valida contra la
  sesión y orquesta con el partner de la sesión.
- **Auditoría append-only intacta** (D5): el evento de acceso cruzado es un
  `INSERT` más; no hay `UPDATE`/`DELETE`. Solo se **amplía** el `CHECK`
  (aditivo, idempotente) — no se relaja ninguna invariante de `006`.
- **Front sin frontera de seguridad**: `partnerScopeMatch` solo evita render de
  vista ajena; el BFF rechaza igualmente aunque el front se saltara.

**Structure Decision**: Enforcement **server-side-first** en el journey (donde
estaba el hueco), reutilizando la sesión sellada y el patrón de derivación de
claims de `006` (cero dependencias nuevas). El partner del asesor se deriva de un
claim del IdP, se valida contra el catálogo (`002`) y se sella en la cookie; cada
request de journey re-verifica sesión + partner y usa el partner de la sesión como
autoritativo, tratando el cruce como *no encontrado*. La auditoría **extiende** el
`audit_log` inmutable de `006`. El front **reutiliza** `TenantStore` (`001`) y
`AuthStore` (`006`) para un guard UX que no es la frontera real.

## Complexity Tracking

> Sin violaciones de la Constitución (que gobierna el front; el BFF sigue sus
> patrones establecidos). **Cero dependencias npm nuevas** (todo se reutiliza de
> `006`). El único cambio de esquema es **aditivo** (ampliar un `CHECK`). Tabla
> intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Check (tras Phase 1)

Re-evaluado con `data-model.md` y `contracts/` ya definidos:

- **I** — ✅ Confirmado: `front-partner-scope.contract.md` resuelve `partnerId`
  vía el DTO de sesión (`AuthQueries.session()` → `AuthApiService` → `HttpClient`)
  volcado a `AuthStore` en `onSuccess`; el guard `partnerScopeMatch` lee
  `AuthStore`/`TenantStore` sin tocar `HttpClient`. Sin axios (el BFF deriva de
  claims).
- **II** — ✅ Confirmado: sin componentes nuevos (se reutiliza `forbidden`).
  Guard **funcional**.
- **III** — ✅ Confirmado: `inject()` en el guard y stores.
- **IV** — ✅ Confirmado: sin CSS/librería nueva; zoneless preservado (signals +
  OnPush).

**Resultado**: **PASA**. El diseño no introduce violaciones. Listo para
`/speckit-tasks`.
