# Implementation Plan: Modelo de Partner y Contrato de Theme

**Branch**: `002-modelo-partner-theme` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-modelo-partner-theme/spec.md`

## Summary

Esta feature define la **fuente de verdad** del modelo multi-tenant de branding:
la entidad **`Partner`** (identidad + estado + puntero al theme vigente), la
entidad **`PartnerTheme`** (una *versión* del branding: tokens, assets, legales,
tipografía), su **proyección pública** (contrato de consumo del front, sin datos
internos sensibles), y el **versionado / publicación / rollback** con auditoría.

El acceso a datos se realiza **exclusivamente** a través de un **puerto
hexagonal** `PartnerRepository`; el motor de almacenamiento es **intercambiable
por configuración** (`PERSISTENCE_DRIVER`). El adaptador V1 usa **SQLite
embebida** (módulo integrado `node:sqlite` de Node 22 — sin dependencia nativa
nueva) con `tokens/assets/legal/typography` serializados como **JSON en columnas
`TEXT`**; cada mutación y su fila de `audit_log` se escriben en la **misma
transacción** (atomicidad todo-o-nada). La durabilidad V1 (RPO ~segundos) la da
**Litestream single-node** como sidecar (respaldo continuo al bucket + `restore`
al arrancar). Los binarios de marca viven en **object storage/CDN**; el modelo
guarda **solo URLs**. Existe un partner sintético **`__default__`** con un theme
neutro para el fallback de la resolución de tenant.

Alcance de esta feature = **dominio + contrato + persistencia (puerto + adaptador
SQLite) + contract-tests + theme default**. Quedan **fuera** (features
posteriores): el transporte HTTP/BFF y la intermediación real de subidas
(PRD 04), el theming/anti-FOUC del front (PRD 03), la UI de Back Office (PRD 05)
y el formato/consulta de auditoría (PRD 06). Aquí se definen las **reglas** que
esos consumidores respetan y los **tipos compartidos** que consumen.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict) — Angular 20.3 en el front;
**código de servidor** en el runtime Node del BFF (Node 22.20, ver más abajo).

**Primary Dependencies**:
- **Servidor/persistencia (nuevo en esta feature)**: `node:sqlite` (`DatabaseSync`,
  módulo integrado de Node ≥ 22.5 — **cero dependencias nativas nuevas**). Sidecar
  **Litestream** (binario de operación, no dependencia npm). Cliente de object
  storage: **diferido** (la subida real la intermedia el BFF, PRD 04); esta
  feature define el contrato de asset (URL) y las reglas de validación/sanitización.
- **Tipos compartidos**: interfaces TS (`Partner`, `PartnerTheme`, `PublicTheme`,
  …) que son la **única fuente de verdad del shape**, consumidas por front
  (vía TanStack Query, PRD 03/04) y servidor.
- **Front (ya presente, sin wiring nuevo aquí)**: Angular Router, `@ngrx/signals`,
  `@tanstack/angular-query-experimental`, `HttpClient`, Tailwind v4.

**Storage**: **SQLite embebida** vía `node:sqlite` (V1). Esquema: `partners`,
`partner_themes`, `audit_log` (ver `data-model.md` y
`contracts/persistence-schema.contract.md`). JSON del branding en columnas `TEXT`.
Índice único en `partners.slug`; índice `(partner_id, version)` en
`partner_themes`. **WAL mode** activo (requisito de Litestream single-node y de
concurrencia lectura/escritura). Binarios **fuera de la BD** (object storage/CDN).
Motor **intercambiable** a Postgres (`JSONB`) mediante un adaptador nuevo del
mismo puerto (hito M2, fuera de esta feature).

**Testing**:
- **Servidor/persistencia (nuevo)**: **`node:test`** (runner integrado) ejecutado
  con **`node --test --experimental-strip-types`** (ejecuta `.ts` sin transpilar y
  sin dependencia nueva; verificado en este entorno con Node 22.20). Cubre la
  **batería de contract-tests del puerto** `PartnerRepository`, reutilizable contra
  *cualquier* adaptador (SQLite hoy, Postgres mañana) — es el gate de la migración
  M2 (SC-009). Los archivos `*.contract-test.ts` viven junto al puerto.
- **Front (sin cambios)**: se mantiene Karma + Jasmine, `*.spec.ts` junto al fuente
  (`ARCHITECTURE.md §9`). Karma corre en navegador y **no** puede cargar
  `node:sqlite`/`fs`; por eso el testing de servidor usa `node:test` — decisión
  registrada en `research.md`.
- **E2E con Playwright**: **no aplica a esta feature** (no produce superficie de
  navegador ni endpoint HTTP propio; el BFF es PRD 04). Se difiere a PRD 03/05.
  Rationale completo en `research.md` → “E2E con Playwright CLI”.

**Target Platform**: Servidor Node 22.20 (runtime del BFF / Angular SSR). El
código de persistencia es Node puro (sin dependencia de Angular), consumible por
el futuro handler SSR/BFF. El front es Web (navegador).

**Project Type**: Aplicación web Angular de proyecto único **con capa de servidor**
(persistencia server-side bajo `src/server/`). El wiring de SSR/BFF (builder,
handlers HTTP) es de PRD 03/04; aquí se entrega la **librería de dominio +
persistencia** aislada y testeable por sí sola.

**Performance Goals**: Lecturas triviales de baja cardinalidad (decenas/cientos de
partners), lectura intensiva y escritura rara solo-admin. `getPublishedTheme(slug)`
es una lectura indexada por `slug` + parse de JSON. La proyección pública del theme
publicado vigente es la operación caliente; el versionado no la degrada
(historial paginado, la lectura apunta a la versión publicada vía `theme_id`).

**Constraints**:
- **Puerto único de acceso a datos** (FR-020): ningún consumidor ejecuta SQL
  directo; SQL vive solo en el adaptador.
- **Motor intercambiable por configuración** (FR-021, SC-009): mismo contract-test
  pasa contra cualquier adaptador.
- **Atomicidad mutación+auditoría** (FR-022): una sola transacción.
- **Durabilidad RPO ~segundos** (FR-023, SC-008): Litestream single-node.
- **Slug único e inmutable** (FR-002) y **no reservado** (coherente con
  `001-resolucion-tenant-routing`): la validación del alta reutiliza
  `normalizeSlug`/`isReservedSegment` del kernel de 001.
- **Aditividad** (FR-006): tokens/assets opcionales no rompen consumidores.
- **Contrato público sin datos sensibles** (FR-007, SC-001): la proyección excluye
  `id`, `partnerId`, credenciales y endpoints.

**Scale/Scope**: Decenas–cientos de partners; ≥ 2 marcas de validación (Banco
Popular verde / Banco Occidente azul, Anexo A del spec). 3 tablas, 1 puerto con
~9 operaciones, 1 adaptador SQLite, 1 batería de contract-tests, 1 theme default.

## Constitution Check

*GATE: Debe pasar antes de Phase 0. Re-evaluado tras Phase 1 (ver final).*

> **Nota de alcance de la Constitución.** Los Principios I–IV gobiernan la
> **capa Angular de UI** (estado, componentes, DI de Angular, estilos/zoneless).
> Esta feature es **server-side + tipos compartidos**: no introduce componentes,
> ni stores, ni HTTP de cliente, ni estilos. Se evalúa cada principio por su
> *espíritu* y por cómo esta feature **habilita** consumo conforme en el front.

**I. Estado y Datos — Separación Síncrono/Asíncrono** — ✅ CUMPLE
- Esta feature **no** introduce estado en el front. Deja los **tipos** del theme
  público como fuente de verdad para que el front lo consuma **como estado de
  servidor vía TanStack Query** (PRD 03/04) — **nunca** en el SignalStore ni con
  `HttpClient` directo en componentes. No se crea ningún `*ApiService` de cliente
  aquí. **Sin axios**: el acceso a datos server-side es vía el puerto, no HTTP.

**II. Componentes Standalone y OnPush** — ✅ N/A (sin componentes)
- No se crea ninguna unidad de UI. Cuando el front consuma el theme (PRD 03), lo
  hará con componentes standalone + `OnPush` (regla intacta, no afectada aquí).

**III. Inyección de Dependencias** — ✅ CUMPLE (en espíritu)
- El código de servidor no usa el DI de Angular (es Node puro). La selección de
  adaptador por `PERSISTENCE_DRIVER` se hace en el **wiring del servidor** (factory
  explícita), coherente con “una sola forma de resolver dependencias”. Ningún
  consumidor instancia SQL/adaptadores ad-hoc: recibe el **puerto**.

**IV. Estilos y Zoneless** — ✅ N/A (sin UI/estilos)
- No hay Tailwind ni detección de cambios en esta feature. No se importa `zone.js`
  ni se inyecta `NgZone` (no hay código Angular).

**Decisiones nuevas que la Constitución no cubre explícitamente** (registradas en
`research.md`, ninguna en conflicto con I–IV):
1. **`node:test` + `--experimental-strip-types` para tests de servidor.** Karma
   (`ARCHITECTURE.md §9`) es navegador y no puede cargar `node:sqlite`. Es una
   **adición** para código que Karma no puede ejecutar, no un reemplazo del testing
   del front. Cero dependencias nuevas.
2. **`node:sqlite` como adaptador V1.** Módulo integrado de Node; evita una
   dependencia nativa (better-sqlite3). Aislado tras el puerto.

**Resultado del gate**: **PASA** sin violaciones. La tabla **Complexity Tracking**
queda vacía (el puerto de repositorio es un requisito explícito del PRD/spec —
FR-020/021 —, no una complejidad injustificada).

## Project Structure

### Documentation (this feature)

```text
specs/002-modelo-partner-theme/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Phase 0 (/speckit-plan) — decisiones y alternativas
├── data-model.md        # Phase 1 (/speckit-plan) — entidades, validación, transiciones, DDL
├── quickstart.md        # Phase 1 (/speckit-plan) — escenarios de validación ejecutables
├── contracts/           # Phase 1 (/speckit-plan)
│   ├── partner-repository.port.md       # el puerto + reglas (SQL solo en adaptador, tx audit)
│   ├── public-theme-projection.contract.md  # shape público + exclusiones (FR-007)
│   ├── persistence-schema.contract.md   # DDL SQLite + espejo Postgres (JSONB)
│   └── repository-contract-tests.md     # batería compartida entre adaptadores (SC-009)
├── checklists/
│   └── requirements.md  # Ya existente (calidad de la spec)
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

La persistencia y el dominio de partner/theme viven **server-side** en
`src/server/` (Node puro, sin Angular), siguiendo el naming de `ARCHITECTURE.md §1`
(sin sufijo de tipo, kebab-case, separador `-`). Los **tipos compartidos** del
contrato viven en una ubicación consumible por front y servidor
(`src/shared/`, promovida por ser cross-boundary — regla de promoción de
`ARCHITECTURE.md §1/§6 extendida a la frontera cliente/servidor; ver research.md`).

```text
src/
  shared/
    partner/                              # tipos = única fuente de verdad del shape (FR-008)
      partner-model.ts                    # Partner (canónico), PartnerStatus, NewPartner, PartnerQuery
      partner-theme-model.ts              # PartnerTheme, ThemeTokens, ThemeAssets, ThemeLegal, ThemeTypography
      public-theme-model.ts               # PublicTheme (proyección pública, sin campos internos) (FR-007)
      theme-projection.ts                 # toPublicTheme(PartnerTheme, Partner): PublicTheme  (pura)
      theme-projection.spec-note          # (cubierto por node:test; ver contract)
  server/
    persistence/
      partner-repository.ts               # PUERTO PartnerRepository (interface) + tipos de I/O (FR-020)
      partner-repository.contract-test.ts # batería compartida: la corre CUALQUIER adaptador (SC-009)
      persistence-config.ts               # lee PERSISTENCE_DRIVER; factory del adaptador (wiring)
      audit.ts                            # AuditEntry + helper de escritura transaccional (FR-022)
      sqlite/
        sqlite-partner-repository.ts      # adaptador SQLite (node:sqlite); SQL + JSON viven aquí (FR-021)
        sqlite-partner-repository.test.ts # ejecuta la contract-test contra el adaptador SQLite
        schema.sql                        # DDL: partners, partner_themes, audit_log, índices, WAL
      # (futuro M2) postgres/postgres-partner-repository.ts  — mismo puerto, JSONB
    theme/
      default-theme.ts                    # Partner __default__ + PartnerTheme neutro (FR-018/019)
    assets/
      asset-validation.ts                 # reglas: MIME, tamaño, dimensiones (FR-016); usadas por BFF (PRD04)
      svg-sanitize.ts                     # sanitización/rechazo de SVG (FR-016)
```

Notas de estructura:
- **`src/app/features/partners/models/partner-model.ts`** (de 001) es una
  **read-projection estrecha** del front (`slug`, `status`, `displayName?`) para
  el guard de ruteo — **distinta** del `Partner` canónico server-side de esta
  feature. No se fusionan: el front consumirá el contrato público, no la entidad
  interna. (Ver `research.md` → “Dos vistas de Partner”.)
- **Litestream** no es código del repo: es configuración de despliegue
  (`litestream.yml`) y se documenta en `quickstart.md` (durabilidad V1). La
  validación de restore es un escenario de quickstart, no un test unitario.
- El wiring de `PERSISTENCE_DRIVER` en el arranque del servidor SSR/BFF se
  **conecta** en PRD 04; aquí se entrega la **factory** (`persistence-config.ts`)
  lista para ser invocada.

**Structure Decision**: Proyecto único Angular **con capa server-side aislada**.
El dominio/persistencia de partner-theme es **server-side puro** (`src/server/`),
para poder usar `node:sqlite`, `fs` y transacciones fuera del navegador y ser
testeado con `node:test` sin acoplarse a Angular. Los **contratos de tipos**
(`src/shared/partner/`) se comparten entre cliente y servidor como fuente única de
verdad del shape (FR-008), cumpliendo el mandato del PRD de “contrato tipado
compartido”. El **puerto** aísla el dialecto SQL para que el escalado a Postgres
(M2) sea un adaptador nuevo sin tocar dominio ni handlers (FR-021).

## Complexity Tracking

> Sin violaciones de la Constitución. El **puerto de repositorio** y el **adaptador
> intercambiable** no son complejidad injustificada: son **requisitos explícitos**
> del spec (FR-020, FR-021) y del PRD 02 §5. Tabla intencionalmente vacía.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
