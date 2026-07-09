---
description: "Task list for Back Office — Gestión de Partners"
---

# Tasks: Back Office — Gestión de Partners

**Input**: Design documents from `/specs/005-back-office-partners/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the plan (§Testing) and `quickstart.md` (unit-spec table) explicitly
request Karma/Jasmine `*.spec.ts` co-located with source (ARCHITECTURE §9).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1..US5 map to the spec's user stories
- Exact file paths included in every task

## Path Conventions

Single Angular project, SSR. Feature code lives under `src/app/features/admin/`. Reuses
`core/theme` (003), `core/tenant` slug rules (001/002), `features/theming/components` (003),
and `shared/partner/*` contracts (002). No `src/server/` changes (BFF `/api/admin/*` = 004).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Feature scaffolding and design tokens for the panel chrome.

- [X] T001 Create the admin feature folder structure (empty dirs) per plan.md: `src/app/features/admin/{layouts,pages,components,models,queries,services,util}/` and `src/app/shared/components/ui/`
- [X] T002 Add the neutral panel chrome design tokens (`--admin-*`: BNP Paribas Cardif — primary `#00965E`, accent `#93BD0E`, link, text, surface, border, font, radii, shadow) to the Tailwind v4 `@theme` block in `src/styles.css`, per `contracts/admin-design-language.contract.md` (kept separate from preview `--brand-*`)
- [X] T003 Ensure the TanStack Query provider (`provideTanStackQuery`, from 004) is registered in `src/app/app.config.ts`; add it if missing so `injectQuery`/`injectMutation` work in the admin feature

**Checkpoint**: Folder skeleton and chrome tokens exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared seams every user story depends on — DTO models, HTTP boundary,
role guard, panel shell/routing, and the base `ui/` atoms.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T004 [P] Define admin DTO + UI-state types (`PartnerListItem`, `PartnerDetail`, `CreatePartnerRequest`, `SaveThemeVersionRequest`, `PublishRequest`, `AssetUploadRequest`, `StoredAssetRef`, `ThemeDraft`, `ContrastWarning`, `PartnersListFilter`) re-using `Partner`/`PartnerTheme`/`ThemeTokens`/`ThemeAssets`/`ThemeLegal`/`ThemeTypography` from `src/shared/partner/` in `src/app/features/admin/models/partner-admin-model.ts` (per `data-model.md`)
- [X] T005 [P] Create base standalone `ui/` atoms with variant `input()`s (OnPush, no ad-hoc Tailwind in consumers) — `button`, `card`, `badge`, `text-input` — in `src/app/shared/components/ui/{button,card,badge,text-input}/*.ts` (ARCHITECTURE §5)
- [X] T006 [P] Create the auth seam consumed by the panel (PRD 06 seam, D6): minimal `AuthStore` exposing the current role in `src/app/core/auth/auth.store.ts`, plus `authGuard` and `roleGuard(role)` (returns `UrlTree` to `/forbidden` when the role does not match) in `src/app/core/auth/auth-guard.ts` and `src/app/core/auth/role-guard.ts`
- [X] T007 [P] Implement `AdminApiService` (`providedIn: 'root'`, wraps `HttpClient`, base from `environment.apiUrl`, no business logic/state) with methods `listPartners`, `getPartner`, `createPartner`, `saveThemeVersion`, `publish`, `deactivate`, `activate`, `uploadAsset` in `src/app/features/admin/services/admin-api.ts` (per `contracts/admin-api.contract.md`)
- [X] T008 [P] Unit spec for `AdminApiService` using `HttpTestingController`: asserts method/URL/body of every call and that no response deserializes `apiKey`/`baseUrl` (FR-016, SC-008) in `src/app/features/admin/services/admin-api.spec.ts`
- [X] T009 [US1] Implement `AdminQueries` (`providedIn: 'root'`) with `partners(filter?)` and `partner(id)` `queryOptions` (keys `['admin','partners',...]`) delegating to `AdminApiService` in `src/app/features/admin/queries/admin-queries.ts` (Const. I; depends on T004, T007)
- [X] T010 Implement `admin-layout` shell (standalone, OnPush): side nav (Partners) + `<router-outlet>`, neutral chrome using `--admin-*` tokens and `ui/` atoms, never applying partner brand (SC-009) in `src/app/features/admin/layouts/admin-layout.ts` (depends on T005)
- [X] T011 Create lazy `admin.routes.ts` — parent `admin-layout` guarded by `canActivate: [authGuard, roleGuard('admin')]`, children `'' → partners-list`, `'nuevo' → partner-create`, `':id/editar' → partner-edit` via `loadComponent` — in `src/app/features/admin/admin.routes.ts` (per `contracts/admin-ui-contract.md`; depends on T006, T010)
- [X] T012 Rewire the `admin` branch in `src/app/app.routes.ts` from `admin-placeholder` to `loadChildren: () => import('./features/admin/admin.routes')`, then delete `src/app/features/admin/admin-placeholder.ts` (depends on T011)

**Checkpoint**: Guarded, lazy panel shell renders; HTTP + query layer ready. Story work can begin.

---

## Phase 3: User Story 1 — Ver y encontrar partners (Priority: P1) 🎯 MVP

**Goal**: A guarded, searchable partners inventory showing name, slug, status, current
theme version, last modification and author.

**Independent Test**: With seeded partners, open `/admin` as `admin` → the list shows
`displayName`, `slug`, status badge, `currentVersion`, `updatedAt`, `updatedBy`; typing in
the search box filters by name/slug without reload; an unknown term shows an explicit empty
state; a non-`admin` user is redirected to `/forbidden` with no data shown.

### Tests for User Story 1

- [X] T013 [P] [US1] Component spec for `partners-list`: client-side filter by name/slug over the cached query + explicit empty-state (no error look) in `src/app/features/admin/pages/partners-list/partners-list.spec.ts` (FR-002, D7, Edge Case)

### Implementation for User Story 1

- [X] T014 [US1] Implement `partners-list` page (standalone, OnPush): `injectQuery(adminQueries.partners())`, a `query` search signal + `computed()` client filter over the cached list, states pending/error/empty/data, table via `ui/` atoms with status badge and row actions (Editar / Preview / Activar-Desactivar placeholders) + "Nuevo partner" button — component must NOT inject `HttpClient`/`AdminApiService` (Const. I) — in `src/app/features/admin/pages/partners-list/partners-list.ts` (FR-001/002; depends on T009)

**Checkpoint**: US1 fully functional and independently testable — the MVP inventory.

---

## Phase 4: User Story 2 — Dar de alta un partner (Priority: P1)

**Goal**: Create a partner from slug + display name; it is born inactive with a v1 draft
theme based on the default template.

**Independent Test**: Open `/admin/nuevo`, submit slug `popular` + "Banco Popular" → a new
inactive partner with a v1 draft appears and the UI navigates to its editor; invalid,
reserved, duplicate slugs and an empty name are each rejected with a clear reason.

### Tests for User Story 2

- [X] T015 [P] [US2] Component spec for `partner-create`: slug format + reserved-name client validation (reusing `core/tenant/slug.ts` + `reserved-names.ts`), required `displayName`, and BFF duplicate/reserved rejection surfaced as `ApiError` in `src/app/features/admin/pages/partner-create/partner-create.spec.ts` (FR-004/005, US2.2–2.5)

### Implementation for User Story 2

- [X] T016 [US2] Implement `partner-create` page (standalone, OnPush): typed Reactive Form (`slug`, `displayName`) reusing slug/reserved-name rules from `src/app/core/tenant/` for client feedback; `injectMutation(createPartner)` that on success invalidates `['admin','partners']` and navigates to `:id/editar`, on error shows the reason without creating anything — in `src/app/features/admin/pages/partner-create/partner-create.ts` (FR-004/005/006; depends on T009)

**Checkpoint**: US1 + US2 both work independently — partners can be inventoried and created.

---

## Phase 5: User Story 3 — Editar la marca con preview en vivo (Priority: P2)

**Goal**: Edit colors, assets, typography and legal text with an isolated live preview on a
real journey screen; warn on AA contrast; save creates a new draft version.

**Independent Test**: On an existing partner, open the editor, change the primary color →
the preview updates instantly without save/publish; a low-contrast text color triggers a
non-blocking AA warning; an invalid logo is rejected; the panel chrome around the preview
stays intact (isolation); saving creates a new draft without touching the live version.

### Tests for User Story 3

- [X] T017 [P] [US3] Unit spec for `contrast-ratio.ts`: known pairs (black/white = 21, mid-grey/white fails AA) return expected ratio and `meetsAA` verdict in `src/app/features/admin/util/contrast-ratio.spec.ts` (FR-008, D2)
- [X] T018 [P] [US3] Unit spec for `scoped-theme.ts`: `applyScopedTheme` writes `--brand-*` on the given host and leaves `document.documentElement` untouched in `src/app/features/admin/util/scoped-theme.spec.ts` (FR-011, SC-009)
- [X] T019 [P] [US3] Component spec for `color-field`: native picker + hex stay synced; `ratio < minimum` shows a warning WITHOUT emitting a `ValidationError` (form stays valid) in `src/app/features/admin/components/color-field/color-field.spec.ts` (FR-008, US3.2)
- [X] T020 [P] [US3] Component spec for `brand-editor`: typed Reactive `FormGroup` (no `ngModel`), `isDirty` derivation, and AA warning does not block save in `src/app/features/admin/components/brand-editor/brand-editor.spec.ts` (FR-007/008)
- [X] T021 [P] [US3] Component spec for `theme-preview`: reapplies tokens in an `effect()` onto its host and renders the real atoms (`brand-logo`/`brand-footer`/`ui`) in `src/app/features/admin/components/theme-preview/theme-preview.spec.ts` (FR-010/012, SC-002)

### Implementation for User Story 3

- [X] T022 [P] [US3] Implement `contrast-ratio.ts`: `contrastRatio(hexA, hexB)` (WCAG 2.1 relative luminance, 1..21) and `meetsAA(ratio, largeText?)` — no npm deps — in `src/app/features/admin/util/contrast-ratio.ts` (FR-008, D2)
- [X] T023 [P] [US3] Implement `scoped-theme.ts`: `applyScopedTheme(host, cssVars)` reusing `toCssVars` from `src/app/core/theme/theme-css-vars.ts`, writing `host.style.setProperty('--brand-*', …)` only (never `:root`/`ThemeStore`/`ThemeApplier`) in `src/app/features/admin/util/scoped-theme.ts` (FR-011, SC-009; D1)
- [X] T024 [P] [US3] Implement `color-field` component (variant of the `ui/` text-input, OnPush): native `<input type="color">` + synced hex input, `input()`s `against` and `minimum`, non-blocking AA warning via `contrast-ratio.ts` in `src/app/features/admin/components/color-field/color-field.ts` (FR-008; depends on T022)
- [X] T025 [P] [US3] Implement `asset-uploader` component (OnPush): client MIME/size/dimension feedback + `injectMutation(uploadAsset)` → `POST /api/admin/assets`, writes returned `url` into the form control, surfaces `ApiError` on server rejection; uses plain `<img>` for freshly-uploaded `data:`/blob previews in `src/app/features/admin/components/asset-uploader/asset-uploader.ts` (FR-009; depends on T009)
- [X] T026 [US3] Implement `brand-editor` component (OnPush): typed `FormGroup` over `tokens`/`assets`/`typography`/`legal`, projects `valueChanges` → `ThemeDraft` signal with `computed()` `previewCssVars`/`isDirty`/`contrastWarnings`; composes `color-field` + `asset-uploader`; `output()` `save`/`publish` in `src/app/features/admin/components/brand-editor/brand-editor.ts` (FR-007; depends on T024, T025, T022)
- [X] T027 [US3] Implement `theme-preview` component (OnPush, zoneless): `input()` the `ThemeDraft`/`previewCssVars`, an `effect()` calling `applyScopedTheme(hostRef, cssVars)`, rendering the "Ofrecimiento del seguro" canvas from the same real atoms (`brand-logo`, `brand-footer`, `ui/` buttons/cards) in `src/app/features/admin/components/theme-preview/theme-preview.ts` (FR-010/011/012, SC-002/009; depends on T023)
- [X] T028 [US3] Implement `partner-edit` page (standalone, OnPush): `injectQuery(adminQueries.partner(id))`, two-zone layout (`brand-editor` left, isolated `theme-preview` right), `injectMutation(saveThemeVersion)` on `save` (creates a new draft, invalidates `['admin','partners', id]`), unsaved-changes discard guard, toast + normalized error on network loss in `src/app/features/admin/pages/partner-edit/partner-edit.ts` (FR-013; depends on T026, T027)

**Checkpoint**: US3 works — brand editing with an isolated, faithful live preview and draft save.

---

## Phase 6: User Story 4 — Publicar una versión de theme (Priority: P2)

**Goal**: Publish the pending draft so it becomes the live version the client sees, with no
redeploy; disable publish when there is nothing new.

**Independent Test**: With a pending draft, click Publish → the version becomes live and the
partner's public route reflects it without redeploy; with no pending draft, Publish is
disabled ("nothing new to publish").

### Implementation for User Story 4

- [X] T029 [US4] Add publish handling to `partner-edit`: `injectMutation(publish)` on the editor's `publish` output → `POST /api/admin/partners/:id/publish` with `{ themeId }`, invalidating `['admin','partners', id]` + `['admin','partners']`; derive the "Publicar" enabled/disabled state from `draftTheme` presence (disabled = "nada nuevo que publicar", US4.3) in `src/app/features/admin/pages/partner-edit/partner-edit.ts` (FR-014, US4; depends on T028)

**Checkpoint**: US1–US4 work — inventory, create, edit-with-preview, and publish.

---

## Phase 7: User Story 5 — Activar / desactivar un partner (Priority: P3)

**Goal**: Logically deactivate and reactivate a partner without any physical delete.

**Independent Test**: Deactivate an active partner → it becomes inactive, stops serving in
the public experience, keeps its history, and still appears in the list; reactivate → it
serves again; no physical delete ever occurs.

### Tests for User Story 5

- [X] T030 [P] [US5] Spec for the activate/deactivate action on `partners-list`: toggling status calls the right mutation and invalidates `['admin','partners', id]` + `['admin','partners']`, with no delete path in `src/app/features/admin/pages/partners-list/partners-list.spec.ts` (FR-015/016)

### Implementation for User Story 5

- [X] T031 [US5] Wire `injectMutation(activate)` / `injectMutation(deactivate)` into the `partners-list` row action (and/or `partner-edit` header): toggles `status`, invalidates the list + detail queries, confirms before deactivating, never deletes in `src/app/features/admin/pages/partners-list/partners-list.ts` (FR-015/016, US5; depends on T014)

**Checkpoint**: All user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story quality, accessibility, and validation.

- [X] T032 [P] Add `/forbidden` route + a minimal standalone `forbidden` page so `roleGuard` redirects land somewhere real, in `src/app/app.routes.ts` and `src/app/features/admin/pages/forbidden/forbidden.ts`
- [X] T033 [P] Accessibility pass on the panel chrome and forms (labels, focus states, keyboard nav, aria for status badges and the AA warning) across `src/app/features/admin/**`
- [X] T034 Run `quickstart.md` scenarios US1–US5 and the unit-spec table via `npm test`; fix any gaps
- [X] T035 Manual visual verification with Playwright CLI: navigate `/admin`, `/admin/nuevo`, `/admin/:id/editar`; confirm preview updates <1 s (SC-002) and the chrome stays intact while editing (SC-009)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–7)**: all depend on Foundational.
  - US1 (P1) and US2 (P1) are independent of each other.
  - US3 (P2) depends only on Foundational (needs a partner to exist in practice, but is
    independently testable with a fixture partner).
  - US4 (P2) extends `partner-edit` → depends on US3 (T028).
  - US5 (P3) extends `partners-list` → depends on US1 (T014).
- **Polish (Phase 8)**: after the desired stories are complete.

### Within Each User Story

- Tests are written before the implementation they cover and must FAIL first.
- Utilities/atoms before the components that compose them; components before pages.
- Story complete before moving to the next priority.

### Parallel Opportunities

- Setup: T002 and T003 can run together after T001.
- Foundational: T004, T005, T006, T007, T008 are all `[P]` (different files). T009→T012 are sequential (queries → layout → routes → wiring).
- US3: all specs T017–T021 `[P]`; utils/atoms T022, T023, T024, T025 `[P]`; then T026 → T027 → T028.
- Different stories can be built by different developers once Foundational is done (respecting US4→US3 and US5→US1 links).

---

## Parallel Example: Foundational (Phase 2)

```bash
# Launch the independent foundational tasks together:
Task: "Define admin DTO + UI-state types in src/app/features/admin/models/partner-admin-model.ts"
Task: "Create base ui/ atoms in src/app/shared/components/ui/*"
Task: "Create authGuard + roleGuard + AuthStore seam in src/app/core/auth/*"
Task: "Implement AdminApiService in src/app/features/admin/services/admin-api.ts"
Task: "Spec AdminApiService with HttpTestingController in src/app/features/admin/services/admin-api.spec.ts"
```

## Parallel Example: User Story 3

```bash
# Specs first (all parallel):
Task: "Unit spec contrast-ratio.spec.ts"
Task: "Unit spec scoped-theme.spec.ts"
Task: "Component spec color-field.spec.ts"
Task: "Component spec brand-editor.spec.ts"
Task: "Component spec theme-preview.spec.ts"

# Then utils/atoms (parallel):
Task: "Implement contrast-ratio.ts"
Task: "Implement scoped-theme.ts"
Task: "Implement color-field.ts"
Task: "Implement asset-uploader.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (guard, shell, HTTP/query layer, atoms).
3. Complete Phase 3 (US1) → validate the inventory independently.
4. Complete Phase 4 (US2) → validate create → **MVP**: partners can be inventoried and created.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → US2 → **MVP** (P1 pair).
3. US3 (editor + isolated preview) → the differentiating value.
4. US4 (publish) → work reaches the client.
5. US5 (activate/deactivate) → lifecycle management.

### Parallel Team Strategy

After Foundational: Dev A → US1 (then US5), Dev B → US2, Dev C → US3 (then US4).

---

## Notes

- `[P]` = different files, no dependencies.
- `[Story]` maps each task to a user story for traceability.
- Const. I: no component injects `HttpClient`/`AdminApiService` — only `injectQuery`/`injectMutation`.
- The preview writes `--brand-*` to its own host only — never `:root`/`ThemeStore` (SC-009).
- Zero new npm dependencies; zero `src/server/` changes (`/api/admin/*` already exists in 004).
- Verify specs fail before implementing; commit after each task or logical group.
