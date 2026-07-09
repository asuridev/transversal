---
description: "Task list for feature: Modelo de Partner y Contrato de Theme"
---

# Tasks: Modelo de Partner y Contrato de Theme

**Input**: Design documents from `specs/002-modelo-partner-theme/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED. Esta feature pide tests explícitamente: la **batería de
contract-tests del puerto** (`repository-contract-tests.md`) es el entregable
central y el **gate de aceptación** (SC-009), junto con el test de la proyección
pública. Se ejecutan con `node --test --experimental-strip-types` (cero
dependencias npm nuevas).

**Organización**: Tareas agrupadas por user story. Los 3 P1 (US1/US2/US3) son el
núcleo funcional (M1, instancia única); US4/US5 (P2) completan assets y fallback.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1–US5 (mapea a las user stories del spec)
- Todas las rutas son relativas a la raíz del repo

## Path Conventions (de plan.md → Project Structure)

- Tipos compartidos (fuente de verdad del shape): `src/shared/partner/`
- Dominio + persistencia server-side (Node puro): `src/server/`
- Kernel de slug reutilizado (feature 001): `src/app/core/tenant/`
- Tests server: `*.test.ts` junto al fuente, runner `node:test`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estructura de carpetas y tooling de test server-side.

- [X] T001 Crear la estructura de carpetas de la feature: `src/shared/partner/`, `src/server/persistence/`, `src/server/persistence/sqlite/`, `src/server/theme/`, `src/server/assets/` (según plan.md → Source Code)
- [X] T002 Añadir el script de test server en `package.json` (p. ej. `"test:server": "node --test --experimental-strip-types \"src/server/**/*.test.ts\" \"src/shared/**/*.test.ts\""`) y verificar `node -v ≥ 22.20` (aporta `node:sqlite`, `node:test`, `--experimental-strip-types`; sin dependencias npm nuevas)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos compartidos, puerto, esquema y esqueleto del adaptador que
**todas** las user stories consumen.

**⚠️ CRITICAL**: Ninguna user story puede empezar hasta completar esta fase.

- [X] T003 [P] Definir tipos canónicos de Partner en `src/shared/partner/partner-model.ts`: `Partner`, `PartnerStatus` (`'active' | 'inactive'`), `NewPartner`, `PartnerQuery` (data-model.md §1)
- [X] T004 [P] Definir tipos de theme en `src/shared/partner/partner-theme-model.ts`: `PartnerTheme`, `ThemeTokens` (paleta mínima aditiva, index signature FR-006), `ThemeAssets`, `ThemeLegal`, `ThemeTypography`, `NewThemeVersion` (data-model.md §2)
- [X] T005 [P] Definir el puerto en `src/server/persistence/partner-repository.ts`: interface `PartnerRepository` (9 operaciones) + `RepositoryError` (`UniqueSlug` | `NotFound` | `Conflict`), importando los tipos de `src/shared/partner/` (contracts/partner-repository.port.md)
- [X] T006 [P] Escribir la DDL en `src/server/persistence/sqlite/schema.sql`: tablas `partners`, `partner_themes`, `audit_log`, índices, `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON` (contracts/persistence-schema.contract.md)
- [X] T007 [P] Definir `src/server/persistence/audit.ts`: tipo `AuditEntry` (entity/entityId/action/actorSub/diff/at) y helper de escritura de `audit_log` reutilizable dentro de una transacción (FR-022, data-model.md §4)
- [X] T008 [P] Crear fixtures de marcas en `src/server/persistence/__fixtures__/brands.ts`: `NewThemeVersion` de Banco Popular (verde) y Banco Occidente (azul) con los tokens del Anexo A (usados por casos 15, P3 y quickstart esc. 4)
- [X] T009 Implementar el esqueleto del adaptador en `src/server/persistence/sqlite/sqlite-partner-repository.ts`: clase `SqlitePartnerRepository`, apertura de `node:sqlite` `DatabaseSync`, aplicación de `schema.sql`, WAL, helpers de (de)serialización JSON de `tokens/assets/legal/typography`, mapeo fila→`Partner`/`PartnerTheme`, y traducción de errores del motor (`UNIQUE constraint failed` → `UniqueSlug`). Métodos aún `throw new Error('not implemented')` (depende de T004–T007)
- [X] T010 Implementar la factory en `src/server/persistence/persistence-config.ts`: `PersistenceDriver`, `createPartnerRepository(driver = PERSISTENCE_DRIVER ?? 'sqlite')` (`postgres` lanza "hito M2"), FR-021 (depende de T005, T009)
- [X] T011 Crear el scaffold de la batería en `src/server/persistence/partner-repository.contract-test.ts`: `export function runPartnerRepositoryContract(makeRepo: () => Promise<PartnerRepository>)` con el `describe('PartnerRepository (contract)')` y los `describe`/`it` vacíos de los 16 casos (contracts/repository-contract-tests.md)
- [X] T012 Crear el wiring del adaptador en `src/server/persistence/sqlite/sqlite-partner-repository.test.ts`: importa `runPartnerRepositoryContract` y le pasa una factory que crea el repo sobre una BD SQLite temporal (`:memory:`/`os.tmpdir()`), aislada por test (depende de T009, T011)

**Checkpoint**: Tipos, puerto, esquema, factory y esqueleto listos — las user
stories pueden implementarse (idealmente en orden de prioridad P1).

---

## Phase 3: User Story 1 - Alta de un partner con su identidad visual (Priority: P1) 🎯 MVP

**Goal**: Persistir atómicamente un `Partner` (`active`, `themeId=null`) + su
`PartnerTheme` v1 en **borrador** + fila de `audit_log`, con `slug` único, válido
y no reservado.

**Independent Test**: Crear un partner con branding y verificar que quedan
persistidos `Partner` y `PartnerTheme` v1 borrador con `slug` único, sin publicar
ni servir el theme (quickstart esc. 1).

### Tests for User Story 1 ⚠️

> Escribir los casos y verlos FALLAR antes de implementar.

- [X] T013 [US1] Implementar los casos 1, 2, 3 y 16 en `src/server/persistence/partner-repository.contract-test.ts`: (1) alta persiste Partner+Theme v1 borrador atómicamente; (2) slug duplicado ⇒ `UniqueSlug`, no persiste; (3) el puerto no expone operación que cambie `slug`; (16) `assets.*Url` son strings, ningún binario persistido
- [X] T014 [P] [US1] Test de la validación de slug en `src/server/persistence/slug-validation.test.ts`: slug con formato inválido / reservado ⇒ rechazado antes del puerto (US1 esc. 3)

### Implementation for User Story 1

- [X] T015 [US1] Implementar `src/server/persistence/slug-validation.ts`: `validateNewPartnerSlug(slug)` reutilizando `normalizeSlug` e `isReservedSegment` del kernel de 001 (`src/app/core/tenant/slug.ts`, `reserved-names.ts`); rechaza formato inválido o reservado antes de llamar al puerto (FR-002, coherente con 001)
- [X] T016 [US1] Implementar `createPartner(input, firstTheme)` en `src/server/persistence/sqlite/sqlite-partner-repository.ts`: transacción única que inserta `partners` (active, themeId null) + `partner_themes` v1 (`publishedAt=null`) + `audit_log` (`action='create'`); traduce slug duplicado a `UniqueSlug` (FR-010/022, US1 esc. 1/2)
- [X] T017 [US1] Implementar `findBySlug(slug)` en el adaptador SQLite (lectura base usada para verificar el alta y por US2/US5); devuelve `Partner | null` incluyendo `status`

**Checkpoint**: US1 funcional y testeable — `test:server` pasa casos 1/2/3/16 y la validación de slug.

---

## Phase 4: User Story 2 - Servir el theme público de un partner activo (Priority: P1)

**Goal**: Devolver la **proyección pública** (`PublicTheme`) del theme publicado
vigente de un partner activo por `slug`, sin ningún campo interno sensible; nunca
servir borradores.

**Independent Test**: Solicitar el theme público de un partner con versión
publicada y verificar el shape exacto del contrato y cero campos internos
(quickstart esc. 2/4).

### Tests for User Story 2 ⚠️

- [X] T018 [P] [US2] Test de proyección pura en `src/shared/partner/theme-projection.test.ts`: casos P1 (shape exacto `{slug,displayName,version,tokens,assets,legal,typography}`), P2 (cero claves internas filtradas), P3 (Popular y Occidente producen idéntico set de claves) (contracts/public-theme-projection.contract.md)
- [X] T019 [US2] Implementar los casos 4, 13 y 15 en la batería (`partner-repository.contract-test.ts`): (4) `getPublishedTheme` devuelve `null` con solo borradores; (13) `findActiveSlugs` devuelve solo slugs `active`; (15) Popular y Occidente válidos sin cambios de esquema, mismo set de claves en su `PublicTheme`

### Implementation for User Story 2

- [X] T020 [P] [US2] Definir `PublicTheme` en `src/shared/partner/public-theme-model.ts` (proyección sin campos internos, FR-007)
- [X] T021 [US2] Implementar la función pura `toPublicTheme(theme, partner)` en `src/shared/partner/theme-projection.ts` (contracts/public-theme-projection.contract.md) (depende de T020)
- [X] T022 [US2] Implementar `getPublishedTheme(slug)` en el adaptador SQLite: devuelve el `PartnerTheme` referenciado por `Partner.themeId` solo si el partner es `active` y tiene versión publicada; `null` en cualquier otro caso (FR-011, nunca borrador)
- [X] T023 [US2] Implementar `findActiveSlugs()` en el adaptador SQLite: slugs de partners `active` (fuente del guard de ruteo de la feature 001)

**Checkpoint**: US1 + US2 funcionan — el theme publicado se sirve como `PublicTheme` sin fugas.

---

## Phase 5: User Story 3 - Versionado, publicación y rollback del theme (Priority: P1)

**Goal**: Cada guardado crea una versión nueva en borrador sin tocar la publicada;
publicar mueve `Partner.themeId`; rollback = re-publicar una versión anterior; todo
con auditoría atómica y sin pérdida de historial.

**Independent Test**: Editar/publicar el theme y verificar versión nueva, la
anterior intacta, el front sirviendo la publicada, y re-publicar restaurando sin
perder historial (quickstart esc. 3).

### Tests for User Story 3 ⚠️

- [X] T024 [US3] Implementar los casos 5, 6, 7, 8, 9 y 10 en la batería (`partner-repository.contract-test.ts`): (5) publicar mueve `themeId`; (6) guardar v2 sin tocar v1 publicada; (7) rollback re-publicando v1 conservando v2; (8) historial completo preservado; (9) cada mutación deja fila en `audit_log` con actor y timestamp; (10) atomicidad: fallo revierte entidad + auditoría

### Implementation for User Story 3

- [X] T025 [US3] Implementar `saveThemeVersion(partnerId, theme)` en el adaptador SQLite: inserta una versión nueva (`version = max+1`) en borrador + `audit_log` (`action='save_version'`) en una transacción, sin tocar la publicada vigente (FR-010/022)
- [X] T026 [US3] Implementar `publishThemeVersion(partnerId, themeId)` en el adaptador SQLite: valida pertenencia (`NotFound`/`Conflict` si el `themeId` no es del partner), mueve `Partner.themeId`, sella `publishedAt`, escribe `audit_log` (`action='publish'`), todo en una transacción; rollback = invocar con una versión anterior existente (FR-012/013/022)

**Checkpoint**: Los tres P1 completos — núcleo funcional M1 (alta → servir → versionar/publicar/rollback).

---

## Phase 6: User Story 4 - Gestión de assets de marca (Priority: P2)

**Goal**: Reglas (sin transporte) de validación de binarios de marca y
sanitización de SVG; el modelo guarda solo URLs.

**Independent Test**: Validar que un archivo inválido (tipo/tamaño/dimensión) se
rechaza con mensaje claro y que un SVG malicioso se sanitiza o rechaza
(quickstart → "Validación de assets").

### Tests for User Story 4 ⚠️

- [X] T027 [P] [US4] Test en `src/server/assets/asset-validation.test.ts`: archivo que excede tamaño/MIME/dimensiones ⇒ rechazado con mensaje claro; logo válido ⇒ aceptado (el theme guarda solo la URL) (FR-016)
- [X] T028 [P] [US4] Test en `src/server/assets/svg-sanitize.test.ts`: SVG con `<script>`/`on*`/`href` peligroso ⇒ sanitizado o rechazado antes de quedar servible (FR-016)

### Implementation for User Story 4

- [X] T029 [P] [US4] Implementar `src/server/assets/asset-validation.ts`: reglas de MIME, tamaño máximo y dimensiones permitidas (FR-016); consumibles por el BFF (PRD 04)
- [X] T030 [P] [US4] Implementar `src/server/assets/svg-sanitize.ts`: sanitización/rechazo de SVG peligroso (FR-016)

**Checkpoint**: Reglas de assets validadas de forma aislada (la subida real es PRD 04).

---

## Phase 7: User Story 5 - Theme por defecto de plataforma (fallback) (Priority: P2)

**Goal**: Partner sintético `__default__` con theme neutro para fallback; baja
lógica de partners; el catálogo excluye `__default__`.

**Independent Test**: Solicitar branding en fallback y verificar que se sirve el
`PublicTheme` neutro con el mismo shape, sin exponer datos de un banco real; y que
`__default__` no aparece en el catálogo (quickstart esc. 5).

### Tests for User Story 5 ⚠️

- [X] T031 [US5] Implementar los casos 11, 12 y 14 en la batería (`partner-repository.contract-test.ts`): (11) `deactivatePartner` ⇒ `getPublishedTheme=null` y no aparece en `findActiveSlugs`; (12) baja lógica: `findBySlug` sigue devolviéndolo con `status='inactive'`; (14) `listPartners` excluye `__default__`
- [X] T032 [P] [US5] Test en `src/server/theme/default-theme.test.ts`: el `PublicTheme` de `__default__` tiene el shape estándar y no expone datos de un banco real (FR-018, SC-007)

### Implementation for User Story 5

- [X] T033 [P] [US5] Implementar `src/server/theme/default-theme.ts`: Partner sintético `__default__` (marcado del sistema) + `PartnerTheme` neutro para el fallback (FR-018/019)
- [X] T034 [US5] Implementar `deactivatePartner(partnerId)` en el adaptador SQLite: `status='inactive'` (nunca DELETE físico) + `audit_log` (`action='deactivate'`) en una transacción (FR-003/022)
- [X] T035 [US5] Implementar `listPartners(query)` en el adaptador SQLite: catálogo paginado que **excluye** el partner del sistema `__default__` (FR-019)

**Checkpoint**: Todas las user stories funcionales — la batería completa (16 casos) + proyección (P1–P3) pasan.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Durabilidad operativa, validación integral y limpieza.

- [X] T036 [P] Añadir la configuración de despliegue `litestream.yml` (replica al bucket, `sync-interval: 1s`) y documentar arranque con `litestream restore -if-replica-exists` (FR-023, SC-008; contracts/persistence-schema.contract.md)
- [X] T037 Ejecutar `test:server` y confirmar en verde los 16 casos de la batería + P1–P3 de proyección (validación funcional M1, quickstart esc. 1–5)
- [ ] T038 Validar el escenario de durabilidad (quickstart esc. 6): replicar `partners.db`, simular caída, `restore` al arrancar y confirmar que `getPublishedTheme(slug)` reproduce el estado publicado vigente (RPO ~segundos) — requiere binario Litestream + bucket/MinIO. **DIFERIDO**: no ejecutado en este entorno (sin binario Litestream ni bucket S3/MinIO disponibles); `litestream.yml` (T036) documenta el procedimiento para cuando el entorno de despliegue lo tenga disponible.
- [X] T039 [P] Revisión final: `any`/tipos, `RepositoryError` tipado en todo el adaptador (sin mensajes SQL filtrados al dominio), y confirmar que ningún consumidor fuera de `sqlite/` contiene SQL (FR-020)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — empieza de inmediato
- **Foundational (Phase 2)**: depende de Setup — **BLOQUEA** todas las user stories
- **User Stories (Phase 3–7)**: dependen de Foundational
  - Los 3 P1 (US1→US2→US3) forman la secuencia natural del MVP; comparten el mismo
    archivo de adaptador y de batería, por lo que se recomienda orden de prioridad
  - US4 (P2) es **independiente** (archivos propios en `src/server/assets/`) — puede
    correr en paralelo a cualquier fase tras Foundational
  - US5 (P2) usa las lecturas del adaptador (findBySlug/getPublishedTheme) de US1/US2
- **Polish (Phase 8)**: depende de las user stories deseadas

### User Story Dependencies

- **US1 (P1)**: solo depende de Foundational
- **US2 (P1)**: depende de Foundational; usa `createPartner`/`findBySlug` de US1 en su setup de test (los casos son acumulativos, como el gate SC-009)
- **US3 (P1)**: depende de Foundational; usa alta + publicación de US1/US2 en su setup
- **US4 (P2)**: totalmente independiente (reglas de assets aisladas)
- **US5 (P2)**: depende de Foundational; usa lecturas de US1/US2

### Within Each User Story

- Tests escritos y FALLANDO antes de implementar
- Tipos/modelos antes de servicios; adaptador antes de la proyección que lo consume
- Historia completa antes de pasar a la siguiente prioridad

### Parallel Opportunities

- Foundational: T003–T008 son `[P]` (archivos distintos); T009 depende de ellos
- US4 completa (T027–T030) puede correr en paralelo a US1/US2/US3
- Dentro de una historia, los `[P]` (tests de archivos distintos, modelos) van juntos

---

## Parallel Example: Foundational (Phase 2)

```bash
# Lanzar juntos los tipos y contratos (archivos distintos, sin dependencias):
Task: "T003 partner-model.ts (Partner, PartnerStatus, NewPartner, PartnerQuery)"
Task: "T004 partner-theme-model.ts (PartnerTheme, ThemeTokens, ...)"
Task: "T005 partner-repository.ts (puerto + RepositoryError)"
Task: "T006 sqlite/schema.sql (DDL + índices + WAL)"
Task: "T007 audit.ts (AuditEntry + helper transaccional)"
Task: "T008 __fixtures__/brands.ts (Popular verde / Occidente azul)"
```

## Parallel Example: User Story 4 (independiente)

```bash
Task: "T027 asset-validation.test.ts"
Task: "T028 svg-sanitize.test.ts"
Task: "T029 asset-validation.ts"
Task: "T030 svg-sanitize.ts"
```

---

## Implementation Strategy

### MVP First (los tres P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todo)
3. Completar Phase 3: US1 (alta) → **STOP & VALIDATE** (quickstart esc. 1)
4. Completar Phase 4: US2 (servir público) → validar (esc. 2/4)
5. Completar Phase 5: US3 (versionado/publicación/rollback) → validar (esc. 3)
6. En este punto el núcleo M1 (instancia única) está completo y demostrable

### Incremental Delivery

1. Setup + Foundational → base lista
2. + US1 → alta persistida (primer incremento con valor)
3. + US2 → theme público servible (contrato observable por el producto)
4. + US3 → versionado seguro (trazabilidad + rollback)
5. + US4 → reglas de assets (paralelizable en cualquier momento)
6. + US5 → fallback/default y baja lógica
7. Polish → durabilidad (Litestream) + validación integral

### Parallel Team Strategy

Tras Foundational: Dev A toma US1→US2→US3 (mismo adaptador/batería, secuencial),
Dev B toma US4 (aislada) en paralelo, y US5 se integra al cerrar los P1.

---

## Notes

- La **batería** (`partner-repository.contract-test.ts`) es un único archivo
  acumulativo: cada historia añade sus casos (T013→T019→T024→T031). Es el gate
  SC-009, reutilizable contra el futuro adaptador Postgres (M2) sin cambios.
- El SQL vive **exclusivamente** en `src/server/persistence/sqlite/` (FR-020).
- `node:sqlite`, `node:test` y `--experimental-strip-types` son integrados de
  Node ≥ 22.5/22.20 — **cero dependencias npm nuevas**.
- E2E con Playwright **no aplica** (sin UI ni endpoint HTTP propio; BFF es PRD 04).
- Commit tras cada tarea o grupo lógico; detenerse en cada checkpoint para validar.
