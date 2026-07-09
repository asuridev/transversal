---
description: "Task list for Aislamiento de Asesor por Partner (Tenant Isolation)"
---

# Tasks: Aislamiento de Asesor por Partner (Tenant Isolation)

**Input**: Design documents from `specs/007-aislamiento-asesor-partner/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md` (D1..D8), `data-model.md`,
`contracts/` (partner-claim, journey-authz, front-partner-scope), `quickstart.md`

**Tests**: INCLUIDOS. Es una feature de **seguridad** cuya frontera vive
server-side; los contratos definen matrices de test explícitas y el proyecto
co-ubica tests (`*.test.ts` server con `node --test`, `*.spec.ts` front con
Karma/Jasmine).

**Organization**: Tareas agrupadas por historia de usuario para implementación y
prueba independientes. **Cero dependencias npm nuevas**: todo reutiliza `001`/`002`/`006`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1, US2, US3 (según `spec.md`)
- Rutas de archivo exactas en cada descripción

## Path Conventions

Proyecto único Angular + BFF Express: `src/server/**` (BFF), `src/app/**` (front),
`infra/sso/**` (IdP dev). Tests co-ubicados junto al fuente.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuración de entorno e IdP dev para el claim de partner (D8)

- [X] T001 [P] Extender el realm de RH-SSO 7.6 con un protocol mapper que emita el claim de partner y usuarios asesor de prueba (`asesor-a`→`banco-a`, `asesor-b`→`banco-b`, más un partner inactivo para el caso deny) en `infra/sso/realm/backoffice-realm.json`
- [X] T002 [P] Añadir `PARTNER_CLAIM_PATH` a la carga de configuración de entorno y al ejemplo/documentación de variables (junto a `OIDC_*`/`ROLE_*` de `006`) en `infra/sso/` y en el composition root `src/server.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Primitivas compartidas por US1 (login con partner) y US2 (enforcement)

**⚠️ CRITICAL**: Ninguna historia puede completarse hasta terminar esta fase

- [X] T003 [P] Crear la derivación del claim de partner (`derivePartnerRef` + `loadPartnerClaimConfigFromEnv`, espejando `role-map.ts`) en `src/server/security/partner-claim.ts` (D1, FR-001/008)
- [X] T004 [P] Tests unitarios del claim de partner (string único, array-de-1, ausente, vacío, múltiple⇒null, tipo inválido, path anidado) en `src/server/security/partner-claim.test.ts`
- [X] T005 Extender `SealedSession` con `partnerId?` y `partnerSlug?` (opcionales) en `src/server/security/session-seal.ts` (D2)
- [X] T006 [P] Ampliar los tests de sellado: round-trip **con** y **sin** partner, manipulación⇒null, expirado⇒null en `src/server/security/session-seal.test.ts`
- [X] T007 Exponer el partner opcional en la sesión desellada (`AdminSession`/vista de sesión) en `src/server/security/admin-auth-guard.ts` (D2)

**Checkpoint**: Derivación de claim + sesión sellada con partner listas.

---

## Phase 3: User Story 1 - Asesor operando exclusivamente la superficie de su partner (Priority: P1) 🎯 MVP

**Goal**: La identidad del asesor se vincula a **exactamente un** partner,
resuelto y validado server-side en el login y sellado en la sesión; el front solo
presenta la vista de ese partner y no ofrece cambiar a otro.

**Independent Test**: Autenticar `asesor-a`; `GET /api/admin/session` ⇒ `200` con
`partnerSlug: "banco-a"`; el front muestra solo `banco-a` y `partnerScopeMatch`
redirige si se navega a otro slug. (Ver `quickstart.md` B1, B4.)

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] Ampliar tests del auth-router: asesor con partner **activo** ⇒ sesión sellada con `partnerId/slug` y DTO los expone; partner **inexistente/inactivo** ⇒ redirect `/forbidden` sin cookie; claim ausente ⇒ sesión sin partner (no rompe flujo admin de `006`) en `src/server/api/auth-router.test.ts`
- [X] T009 [P] [US1] Spec del `AuthStore` para `partnerId()/partnerSlug()/isAsesor` en `src/app/core/auth/auth.store.spec.ts`
- [X] T010 [P] [US1] Spec del guard `partnerScopeMatch` (partner nulo⇒true; match⇒true; mismatch⇒`UrlTree`) en `src/app/core/tenant/partner-scope-guard.spec.ts`

### Implementation for User Story 1

- [X] T011 [US1] Derivar el partner del claim, **validarlo contra el catálogo** (`partnerRepository.findBySlug` existe + `active`) y sellarlo en la sesión en el callback OIDC; añadir deps `partnerClaimConfig` y `partnerRepository` al router en `src/server/api/auth-router.ts` (D1/D2, FR-001/008)
- [X] T012 [US1] Extender el DTO de `GET /api/admin/session` con `partnerId?`/`partnerSlug?` en `src/server/api/auth-router.ts` (D7) — mismo archivo que T011, secuencial
- [X] T013 [US1] Cablear `loadPartnerClaimConfigFromEnv()` + `partnerRepository` en las deps del auth-router en el composition root `src/server.ts`
- [X] T014 [P] [US1] Extender `AuthUser` con `partnerId?`/`partnerSlug?` en `src/app/core/auth/auth-model.ts` (D7)
- [X] T015 [US1] Añadir computed síncronos `partnerId()/partnerSlug()/isAsesor` al `AuthStore` en `src/app/core/auth/auth.store.ts` (depende de T014)
- [X] T016 [US1] Tipar `SessionDto` con partner y volcarlo al `AuthStore` en `onSuccess` en `src/app/features/auth/queries/auth-queries.ts` y `src/app/features/auth/services/auth-api.ts` (D7) — `SessionDto = AuthUser` ya heredaba los campos de T014; `onSuccess` en `app.config.ts` ya vuelca el DTO completo
- [X] T017 [P] [US1] Crear el guard funcional `partnerScopeMatch` (compara `TenantStore.slug()` vs `AuthStore.partnerSlug()`, redirige en desajuste) en `src/app/core/tenant/partner-scope-guard.ts` (D6, UX)
- [X] T018 [US1] Encadenar `partnerScopeMatch` tras `tenantMatch` en las rutas del journey del asesor en `src/app/app.routes.ts` (o el archivo de rutas del journey)

**Checkpoint**: El asesor entra vinculado a un único partner y el front solo
muestra su vista. (La frontera server-side real llega en US2.)

---

## Phase 4: User Story 2 - Rechazo del lado servidor de accesos cruzados (Priority: P1)

**Goal**: Aunque el asesor manipule la petición (slug en URL, parámetro, cabecera
o cuerpo) para referenciar otro partner, el **servidor** rechaza el acceso como
*no encontrado* (sin enumeración), usa el partner de la **sesión** como
autoritativo y **audita** el intento.

**Independent Test**: Como `asesor-a`, `POST /api/journey/banco-b/…` ⇒ `404` sin
fuga + exactamente **una** fila `access/cross_partner_denied` en `audit_log`; body
`{partnerId:"banco-b"}` con URL `banco-a` ⇒ `200` orquestando `banco-a`; sin
sesión ⇒ `401`. (Ver `quickstart.md` B2; `contracts/journey-authz.contract.md` §2.)

### Tests for User Story 2 ⚠️

- [X] T019 [P] [US2] Tests unitarios de `require-partner-scope` (sin sesión⇒401; sin partner⇒404; cruce⇒404+auditoría; partner inactivo⇒404; match⇒`next()` con `req.partner`) en `src/server/security/require-partner-scope.test.ts`
- [X] T020 [P] [US2] Tests de integración del journey-router (matriz completa: 401 sin sesión, 404 admin, 200 propio, 404+audit cruce, 404 inactivo, 400 slug inválido, 200 ignorando partner del body) en `src/server/api/journey-router.test.ts`
- [X] T021 [P] [US2] Test de append + inmutabilidad del evento de acceso cruzado en `audit_log` en `src/server/persistence/sqlite/sqlite-partner-repository.test.ts`

### Implementation for User Story 2

- [X] T022 [P] [US2] Ampliar el modelo de auditoría: `AuditEntity += 'access'`, `AuditAction += 'cross_partner_denied'` en `src/server/persistence/audit.ts` (D5)
- [X] T023 [US2] Ampliar (aditivo, idempotente) el `CHECK` de `entity`/`action` de `audit_log` en `src/server/persistence/sqlite/schema.ts` (D5, sin migración destructiva)
- [X] T024 [US2] Implementar `appendAccessDenied({actorSub, actorName, attemptedSlug})` como `INSERT` append-only (sin transacción de mutación) en `src/server/persistence/sqlite/sqlite-partner-repository.ts` (depende de T022, T023) — método añadido también a la interfaz `PartnerRepository`
- [X] T025 [US2] Crear el middleware `requirePartnerScope(deps)` (desella sesión⇒401; sin partner⇒404; `:slug`≠`session.partnerSlug`⇒404+`recordCrossPartnerDenied`; partner inactivo⇒404; adjunta `req.partner`) en `src/server/security/require-partner-scope.ts` (D3, FR-003/004/005/007/009) — incluye validación de formato del slug (400) antes de la comparación de scope
- [X] T026 [US2] Anteponer `requirePartnerScope` en `POST /:slug/{*action}` y orquestar con `req.partner.slug` (ignorando el `:slug`/partner del cliente) en `src/server/api/journey-router.ts` (D4, FR-005/006; depende de T025)
- [X] T027 [US2] Pasar las deps del journey guard (`sessionSeal`, `isActivePartner` desde `partnerRepository.findActiveSlugs`/`findBySlug`, `recordCrossPartnerDenied` desde `appendAccessDenied`) en `src/server/api/api-router.ts` y `src/server.ts`

**Checkpoint**: El aislamiento server-side es efectivo e ineludible; los cruces se
auditan. US1 + US2 = garantía de seguridad del enunciado.

---

## Phase 5: User Story 3 - Alcance automático de listados y consultas (Priority: P2)

**Goal**: Toda lectura colectiva (listado, búsqueda, agregación, exportación) que
haga un asesor queda acotada automáticamente a su partner de sesión, sin depender
de un filtro enviado por el cliente y sin fuga de conteos/totales ajenos.

**Independent Test**: Con recursos de `banco-a` y `banco-b`, una lectura colectiva
como `asesor-a` (incluso forzando un filtro `partner=banco-b`) devuelve solo
`banco-a`; los conteos/totales reflejan solo `banco-a`. (Ver `spec.md` US3.)

### Tests for User Story 3 ⚠️

- [X] T028 [P] [US3] Test de que un filtro de partner suministrado por el cliente (query o body) **nunca** amplía el alcance: el scope permanece en `session.partnerSlug` en `src/server/security/require-partner-scope.test.ts` (cubierto por P4/P8, y P9 para rutas sin `:slug`)

### Implementation for User Story 3

- [X] T029 [US3] Generalizar `requirePartnerScope` para aplicarse también a rutas de lectura/listado partner-scoped (no solo `POST` journey), exponiendo `req.partner` y un helper `partnerScopeFilter(req)` como filtro obligatorio derivado de la sesión, en `src/server/security/require-partner-scope.ts` (FR-006, depende de T025) — la comparación de `:slug` se omite si la ruta no lo declara, delegando el alcance íntegramente a la sesión
- [ ] T030 [US3] Aplicar `requirePartnerScope` + `partnerScopeFilter(req)` a los endpoints de lectura colectiva del asesor (montaje en el sub-router y derivación del filtro desde `req.partner`, ignorando cualquier filtro de partner del cliente) en `src/server/api/api-router.ts` (FR-006/007) — **NO APLICABLE todavía**: al revisar el código no existe hoy ningún endpoint de lectura colectiva del asesor (`public-router.ts` es público/sin sesión; `journey-router.ts` es solo `POST` de acciones; los listados de `admin-router.ts` son del Back Office, por rol, no por partner). La primitiva reutilizable queda lista y probada (T029) para cuando se implemente el primer endpoint de este tipo (p. ej. KYC/PRD 09); dejar esta tarea pendiente hasta que exista ese endpoint evita montar wiring sobre código inexistente.

**Checkpoint**: Ninguna lectura colectiva del asesor puede filtrar datos de otro
partner, ni siquiera por omisión de filtro.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Observabilidad, validación E2E y endurecimiento

- [X] T031 [P] Emitir log estructurado de observabilidad del intento de acceso cruzado (además de la auditoría) vía `logRequestError` en `src/server/observability/request-log.ts` y `src/server/security/require-partner-scope.ts`
- [X] T032 Ejecutar la validación de `quickstart.md` (B1 acceso legítimo, B2 rechazo server-side + auditoría, B4 deny por vínculo inválido) contra el `createApiRouter` real (SQLite real + sesión sellada real, vía script desechable) — resultados: B1 502 mashery_unavailable tras pasar la frontera (no 401/404), B2 404 + 1 fila `cross_partner_denied` en `audit_log`, B2.4 partner del body ignorado (502 igual que B1, orquestó `banco-a`), sin sesión 401, B4 partner inactivo 404. **B3 (guard UX en navegador) y el login OIDC real quedan sin ejercitar** — requieren el IdP RH-SSO 7.6 vía podman (no disponible en este entorno); cubiertos por `partner-scope-guard.spec.ts` (T010) y `auth-router.test.ts` (T008) a nivel unitario/integración
- [X] T033 [P] Actualizar documentación de arquitectura del BFF si aplica — **NO APLICABLE**: `.claude/ARCHITECTURE.md` documenta exclusivamente convenciones del front Angular (carpetas, estado, HTTP, routing), no patrones internos del BFF Express; el patrón reutilizable de partner-scoping ya queda documentado en `specs/007-aislamiento-asesor-partner/contracts/journey-authz.contract.md`
- [X] T034 Revisión de seguridad del aislamiento: verificado por grep que `journey-router.ts` no lee `req.params`/`req.body` para el partner de orquestación (solo `req.partner.slug`, derivado de la sesión); verificado que `audit_log` solo recibe `INSERT` (ningún `UPDATE`/`DELETE` en el código de producción); verificado que el cruce responde `404 not_found` (mismo código que "no existe", sin enumeración)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — **BLOQUEA** todas las historias
- **US1 (Phase 3)**: depende de Foundational (usa `partner-claim` + `SealedSession`)
- **US2 (Phase 4)**: depende de Foundational; **independiente de US1** (enforcement
  del journey; puede probarse sellando una sesión de asesor directamente en test)
- **US3 (Phase 5)**: depende de US2 (reutiliza/generaliza `requirePartnerScope`, T025)
- **Polish (Phase 6)**: depende de las historias deseadas completas

### User Story Dependencies

- **US1 (P1)**: tras Foundational. Sin dependencia de otras historias.
- **US2 (P1)**: tras Foundational. Independiente de US1 (comparten `session-seal` y
  `partner-claim` de la fundación, pero no se acoplan entre sí).
- **US3 (P2)**: tras US2 (T025 `requirePartnerScope` es su base).

### Within Each User Story

- Los tests (co-ubicados) se escriben primero y deben **fallar** antes de implementar
- Persistencia/modelo antes que middleware; middleware antes que su montaje en el router
- Modelo de front antes que store/queries antes que guard/rutas

### Parallel Opportunities

- Setup: T001 y T002 en paralelo
- Foundational: T003/T004 (claim) en paralelo con T005/T006 (sellado); T007 tras T005
- US1: T008/T009/T010 (tests) en paralelo; T014/T017 en paralelo; server (T011→T012→T013) secuencial por compartir `auth-router.ts`/`server.ts`
- US2: T019/T020/T021 (tests) en paralelo; T022 en paralelo con T025; T023→T024 secuencial; T026 tras T025; T027 al final
- Una vez lista la Fundación, **US1 y US2 pueden desarrollarse en paralelo** por personas distintas

---

## Parallel Example: Foundational + US2 tests

```bash
# Fundación — primitivas independientes en paralelo:
Task: "partner-claim.ts + test (T003, T004)"
Task: "session-seal.ts extensión + test (T005, T006)"

# US2 — arrancar la batería de tests de la frontera en paralelo:
Task: "require-partner-scope.test.ts (T019)"
Task: "journey-router.test.ts (T020)"
Task: "sqlite-partner-repository.test.ts append/inmutabilidad (T021)"
```

---

## Implementation Strategy

### MVP (garantía de seguridad = US1 + US2, ambas P1)

1. Phase 1 (Setup) → Phase 2 (Foundational)
2. Phase 3 (US1): el asesor entra vinculado a un partner y el front solo muestra su vista
3. Phase 4 (US2): **frontera server-side** — rechazo de cruces + auditoría
4. **STOP y VALIDAR**: `quickstart.md` B1+B2 (el asesor A no accede a B, ni server-side)
5. Desplegar/demostrar

> US1 aislada entrega el binding + UX, pero la **garantía de aislamiento del
> enunciado ("seguridad del lado del servidor") requiere US2**. Por eso el MVP
> recomendado incluye ambas P1.

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → binding + UX (demo del "solo mi partner")
3. US2 → frontera server-side + auditoría (demo del "no puedo acceder a otro")
4. US3 → acotado automático de lecturas colectivas
5. Cada historia añade valor sin romper las anteriores

### Parallel Team Strategy

1. El equipo completa Setup + Foundational juntos
2. Luego, en paralelo: Dev A → US1 (auth-router + front); Dev B → US2 (middleware +
   journey + auditoría)
3. US3 la toma quien libere US2

---

## Notes

- **Cero dependencias npm nuevas**: se reutilizan `openid-client`/`node:crypto`/
  `node:sqlite` (`006`), `PartnerRepository`/`audit_log` (`002`), `TenantStore`/
  `AuthStore` (`001`/`006`)
- El único cambio de esquema (T023) es **aditivo** (ampliar un `CHECK`); no relaja
  la inmutabilidad de `audit_log`
- El front (T017/T018) es **UX, no frontera**: el BFF rechaza igual (US2)
- [P] = archivos distintos, sin dependencias pendientes
- Verificar que los tests fallan antes de implementar; commit por tarea o grupo lógico
- Detenerse en cualquier checkpoint para validar la historia de forma independiente
