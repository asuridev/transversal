---
description: "Task list for Resolución de Tenant y Routing"
---

# Tasks: Resolución de Tenant y Routing

**Input**: Design documents from `specs/001-resolucion-tenant-routing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The spec makes verification of the resolver's behavior a
first-class success criterion (SC-006) and the plan enumerates colocated
`*.spec.ts` files. Test tasks are therefore part of scope.

**Organization**: Tasks are grouped by user story. The pure resolution kernel
(`resolveTenant` + models + `normalizeSlug` + `RESERVED_NAMES`) and the
server-state source (`PartnersApiService`/queries) and sync `TenantStore` are
shared by **all** stories, so they live in Foundational (Phase 2). Each user
story phase then adds only its routing/guard/UI increment and can be validated
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1, US2, US3 (maps to the user stories in spec.md)
- Every task includes an exact file path.

## Path Conventions

Single-project Angular app. Source under `src/app/`. Tests are Karma + Jasmine
`*.spec.ts` colocated next to the source (Angular CLI default, `ARCHITECTURE.md §9`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding and configuration. Dependencies
(`@ngrx/signals`, `@tanstack/angular-query-experimental`, Tailwind) are already
installed and `app.config.ts` already provides `HttpClient` + TanStack Query — no
new wiring of those is needed.

- [X] T001 [P] Create environment files `src/environments/environment.ts` and `src/environments/environment.development.ts` exposing `apiUrl` and `partnersStaleTime` (TTL, default `60_000` ms — FR-015), and register `fileReplacements` for the `development` configuration in `angular.json`
- [X] T002 Create the feature folder skeleton (empty dirs / index barrels as needed): `src/app/core/tenant/`, `src/app/core/store/`, `src/app/features/partners/{models,services,queries}/`, `src/app/features/landing/`, `src/app/features/partner-shell/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure resolution kernel, the server-state source, and the sync
store. Shared by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Domain types & pure kernel (`core/tenant/`)

- [X] T003 [P] Define `TenantInput`, `TenantResolution` (discriminated union on `kind`), `ReservedArea`, and `FallbackReason` in `src/app/core/tenant/tenant-resolution-model.ts` (per data-model.md §1–2, FR-011, FR-013)
- [X] T004 [P] Implement `normalizeSlug(raw): string | null` (trim → lowercase → validate `^[a-z0-9-]{2,40}$`, never throws) in `src/app/core/tenant/slug.ts` (FR-002, contract §2)
- [X] T005 [P] Implement `RESERVED_NAMES` (`ReadonlySet<string>`: `admin`, `api`, `assets`, `static`, `health`, `_next`, `favicon.ico`, `robots.txt`) and `isReservedSegment(rawSegment): ReservedArea | null` (exact, case-insensitive on lowercased raw segment, maps each name to its area; `_next`/`favicon.ico`/`robots.txt` → `system`) in `src/app/core/tenant/reserved-names.ts` (FR-005, data-model.md §5)
- [X] T006 [US-shared] Implement `resolveTenant(input, activeSlugs): TenantResolution` in `src/app/core/tenant/resolve-tenant.ts` applying the ordered algorithm (root → reserved → invalid-slug fallback → active-lookup → fallback) from `contracts/resolve-tenant.contract.md §1` (FR-001, FR-003, FR-004, FR-005, FR-006, FR-007, FR-010) — depends on T003, T004, T005

### Kernel unit tests (SC-006)

- [X] T007 [P] Unit tests for `normalizeSlug` in `src/app/core/tenant/slug.spec.ts` (lowercase, trim, charset, length < 2 and > 40 boundaries → `null`)
- [X] T008 [P] Unit tests for `isReservedSegment` / `RESERVED_NAMES` in `src/app/core/tenant/reserved-names.spec.ts` (`admin`, `API`/`Admin` case-insensitive, `favicon.ico` non-slug charset, correct `area` mapping)
- [X] T009 [P] Unit tests for `resolveTenant` in `src/app/core/tenant/resolve-tenant.spec.ts` covering ALL 16 cases of the behavior table in `contracts/resolve-tenant.contract.md §1` (maps 1:1 to SC-006) — depends on T006

### Server-state source (`features/partners/`)

- [X] T010 [P] Define `Partner`, `PartnerSlug`, `PartnerStatus` types in `src/app/features/partners/models/partner-model.ts` (data-model.md §3)
- [X] T011 [P] Implement `PartnersApiService` (`providedIn: 'root'`, `inject(HttpClient)`, reads `environment.apiUrl`) with `getActivePartners(): Observable<ReadonlySet<PartnerSlug>>` mapping DTO Forma A (`{slugs}`) and Forma B (`{partners}` filtered by `status==='active'`) → `Set` in `src/app/features/partners/services/partners-api.ts` (contract `partners-source.contract.md §2–3`) — depends on T010
- [X] T012 [P] Unit test `PartnersApiService` mapping of Forma A and Forma B → `ReadonlySet<PartnerSlug>` in `src/app/features/partners/services/partners-api.spec.ts` (uses `HttpTestingController`) — depends on T011
- [X] T013 Implement `PartnersQueries` (`providedIn: 'root'`, `inject(PartnersApiService)`) exposing `activePartners()` via `queryOptions({ queryKey: ['partners','active'], queryFn, staleTime: environment.partnersStaleTime })` in `src/app/features/partners/queries/partners-queries.ts` (FR-015, contract §2) — depends on T011

### Sync store (`core/store/`)

- [X] T014 [P] Implement `TenantStore` (NgRx SignalStore, `providedIn: 'root'`) holding `resolution: TenantResolution | null` with `withComputed` derivations `partnerSlug`, `isPartner`, `isFallback`, and a `setResolution` updater (never stores the partner list — Constitución I) in `src/app/core/store/tenant.store.ts` (data-model.md §6, FR-008) — depends on T003
- [X] T015 [P] Unit test `TenantStore` (publish a `partner` resolution → `partnerSlug`/`isPartner` derivations; `fallback` → `isFallback`) in `src/app/core/store/tenant.store.spec.ts` — depends on T014

**Checkpoint**: Pure resolver + server source + sync store are complete and unit-tested. User story implementation can now begin.

---

## Phase 3: User Story 1 - Acceso a un partner activo por URL (Priority: P1) 🎯 MVP

**Goal**: Opening `app.com/{partner}/...` for an active partner resolves the
correct `partnerSlug`, publishes it to `TenantStore`, and renders the partner
shell — reusing the cached partner list across intra-journey navigation.

**Independent Test**: With the source serving `popular`/`otrobanco` active, open
`/popular/oferta` → partner shell renders and `TenantStore.partnerSlug === 'popular'`;
navigate `/popular/oferta` → `/popular/beneficiarios` → no second `GET /partners/active`.

### Tests for User Story 1 ⚠️

- [X] T016 [P] [US1] Spec for `tenantMatch` in `src/app/core/tenant/tenant-guard.spec.ts`: active-partner path → returns `true` and publishes a `{kind:'partner'}` resolution to `TenantStore`; non-partner path → returns `false` (mock `QueryClient`/`PartnersQueries`/`TenantStore`)

### Implementation for User Story 1

- [X] T017 [US1] Implement `tenantMatch: CanMatchFn` in `src/app/core/tenant/tenant-guard.ts`: reconstruct `pathname` from segments, `inject(QueryClient).ensureQueryData(partnersQueries.activePartners())`, run `resolveTenant`, `patchState` into `TenantStore`, return `true` only when `kind === 'partner'`; wrap `ensureQueryData` in try/catch that publishes a `fallback` resolution and returns `false` (fail-safe, FR-014) — NEVER `inject(HttpClient)`/`PartnersApiService` (Constitución I) — depends on T006, T013, T014
- [X] T018 [P] [US1] Create the standalone `PartnerShell` placeholder (OnPush, no `Component` suffix, reads `TenantStore.partnerSlug`) in `src/app/features/partner-shell/partner-shell.ts` (validation surface for a resolved partner)
- [X] T019 [US1] Register the `:partnerSlug` route with `canMatch: [tenantMatch]` lazy-loading `PartnerShell` in `src/app/app.routes.ts` (shared file — see US2/US3) — depends on T017, T018

**Checkpoint**: User Story 1 is fully functional — an active partner URL resolves and renders under its slug, and intra-partner navigation reuses the cached list.

---

## Phase 4: User Story 2 - Enlace inválido o partner inactivo (Priority: P1)

**Goal**: Any URL whose first segment is unknown, invalid, or an inactive
partner (and the bare root) falls through to a neutral default landing that does
not list partners and does not reveal the cause.

**Independent Test**: Open `/no-existe/x`, `/inactivo`, `/Popular!`, and `/` →
neutral landing with default identity and message, no console errors, no way to
distinguish unknown from inactive.

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] Spec for the fail-safe branch of `tenantMatch` in `src/app/core/tenant/tenant-guard.spec.ts`: when `ensureQueryData` rejects → publishes `fallback` and returns `false`, indistinguishable from unknown slug (no error propagated) — extends T016
- [X] T021 [P] [US2] Spec for `Landing` in `src/app/features/landing/landing.spec.ts`: renders the neutral message ("Este enlace no corresponde a un socio activo") and does NOT render any partner list/selector (FR-004, FR-007, SC-003)

### Implementation for User Story 2

- [X] T022 [P] [US2] Create the standalone `Landing` (OnPush, Tailwind, default identity, neutral message, no partner enumeration) in `src/app/features/landing/landing.ts` (FR-004, FR-006, FR-007)
- [X] T023 [US2] Add the root route `'' → Landing` and the wildcard fallback route `'**' → Landing` (lazy) in `src/app/app.routes.ts`, ordered AFTER `:partnerSlug` (shared file) — depends on T022, T019

**Checkpoint**: User Stories 1 AND 2 both work — valid partners render; everything else (root, unknown, invalid, inactive, source-down) falls to the uniform neutral landing.

---

## Phase 5: User Story 3 - Rutas reservadas del sistema (Priority: P2)

**Goal**: Reserved first segments (`/admin`, `/api`, `/assets`, …) are never
interpreted as a partner and take precedence over `:partnerSlug`.

**Independent Test**: Open `/admin` → Back Office placeholder (never partner shell);
open `/api/...` → treated as reserved, never partner.

### Tests for User Story 3 ⚠️

> Note: `resolveTenant`'s reserved-name classification (cases `/admin`, `/api`,
> `/Admin`, `/favicon.ico`) is already covered by T009 (SC-006). US3 adds only
> the routing-precedence increment.

- [X] T024 [US3] Add a routing-precedence spec (reserved route matches its placeholder, `:partnerSlug`/`tenantMatch` is never reached for `/admin`) in `src/app/app.routes.spec.ts`

### Implementation for User Story 3

- [X] T025 [P] [US3] Create the standalone `AdminPlaceholder` (OnPush) Back Office stub in `src/app/features/admin/admin-placeholder.ts` (PRD 05 placeholder, sufficient to prove precedence)
- [X] T026 [US3] Register reserved routes (`admin`, `api`, and other `RESERVED_NAMES` areas as needed) DECLARED BEFORE `:partnerSlug` in `src/app/app.routes.ts` so they take precedence (FR-005) — depends on T025, T019

**Checkpoint**: All three user stories are independently functional; reserved routes win over partner resolution.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cross-cutting cleanup.

- [X] T027 Run the resolver unit suite `npm test -- --include='**/core/tenant/**/*.spec.ts'` and confirm all SC-006 cases are green (quickstart §A)
- [X] T028 Run the browser flow validation (quickstart §B) with a mock serving `{ "slugs": ["popular","otrobanco"] }`: partner active, intra-partner no-refetch, root, unknown, inactive, invalid format, reserved `/admin` and `/api`
- [X] T029 Run the fail-safe validation (quickstart §C): stop/500 the source, open `/popular/oferta` → neutral landing, no "service unavailable", no propagated error (FR-014, SC-003)
- [X] T030 [P] Ensure `RESERVED_NAMES` is exported as the single source of truth so the Back Office slug-alta validation (FR-012, PRD 05) can reuse it, and note this in `src/app/core/tenant/reserved-names.ts` (no Back Office UI in this feature)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational. US1 and US2 are both
  P1; US2 depends on US1 only for the shared `app.routes.ts` ordering (T023 after
  T019). US3 (P2) depends on US1 for route ordering (T026 before `:partnerSlug`).
- **Polish (Phase 6)**: Depends on all desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: Foundational only. Delivers the MVP (a partner resolvable by URL).
- **US2 (P1)**: Foundational + the `Landing`; shares `app.routes.ts` with US1.
  Independently testable (fallback/root paths).
- **US3 (P2)**: Foundational + reserved placeholders; shares `app.routes.ts`.
  Reserved classification is already proven by T009.

### Shared-file note (`src/app/app.routes.ts`)

T019 (US1), T023 (US2), and T026 (US3) all edit `app.routes.ts` and must run
**sequentially** (not `[P]`) in route-precedence order: reserved routes → `:partnerSlug`
→ `''` → `'**'`.

### Parallel Opportunities

- Setup: T001 ∥ (T002 after).
- Foundational: T003, T004, T005 ∥; then T006; T007, T008, T010, T014 ∥; T009 after T006; T011 then T012 ∥ with T013; T015 after T014.
- US1: T016 ∥ T018; then T017; then T019.
- US2: T020, T021, T022 ∥; then T023.
- US3: T025 ∥ (spec T024); then T026.

---

## Parallel Example: Foundational kernel

```bash
# Independent domain/pure files (different files, no cross-deps):
Task: "Define types in src/app/core/tenant/tenant-resolution-model.ts"   # T003
Task: "Implement normalizeSlug in src/app/core/tenant/slug.ts"           # T004
Task: "Implement RESERVED_NAMES in src/app/core/tenant/reserved-names.ts" # T005

# Then, after resolveTenant (T006) lands, its unit tests in parallel:
Task: "slug.spec.ts"            # T007
Task: "reserved-names.spec.ts"  # T008
Task: "resolve-tenant.spec.ts"  # T009
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (pure resolver + source + store) — CRITICAL, blocks all.
3. Phase 3: US1 — guard + partner shell + `:partnerSlug` route.
4. **STOP and VALIDATE**: open `/popular/oferta`, confirm resolution + no-refetch.
5. Demo the MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → active partner resolvable (MVP).
3. US2 → neutral landing catches root/unknown/inactive/source-down (publishable).
4. US3 → reserved-route precedence.
5. Polish → quickstart §A/B/C validation.

---

## Notes

- [P] = different files, no dependencies on incomplete tasks.
- Verify kernel tests (T007–T009) fail before implementing, then green after T004–T006.
- `app.routes.ts` is a shared file across US1/US2/US3 — keep those edits sequential.
- Observability of the fallback `reason` is out of scope (delegated); the `reason`
  stays in the result for a future layer to consume.
- Commit after each task or logical group.
</content>
</invoke>
