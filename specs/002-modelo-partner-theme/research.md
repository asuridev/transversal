# Phase 0 — Research: Modelo de Partner y Contrato de Theme

Consolida las decisiones técnicas de la feature. Cada entrada: **Decisión**,
**Rationale**, **Alternativas consideradas**. No quedan `NEEDS CLARIFICATION`.

---

## 1. Ubicación del código de persistencia (server-side)

- **Decisión**: El dominio y la persistencia de partner/theme viven en
  `src/server/` como **Node puro**, sin dependencia de Angular. Los **tipos del
  contrato** viven en `src/shared/partner/` y son consumidos por front y servidor.
- **Rationale**: La persistencia necesita `node:sqlite`, `fs` y transacciones —
  APIs de Node que **no existen** en el navegador. Aislar el código server-side lo
  hace testeable con `node:test` sin acoplarse al ciclo de vida de Angular, y deja
  el puerto listo para el handler SSR/BFF (PRD 04). Compartir solo *tipos* (no
  implementación) evita filtrar SQL o secretos al bundle del cliente.
- **Alternativas**: (a) meter todo en `src/app/` — rechazado: mezclaría código
  Node con el bundle del navegador y rompería el testing con Karma. (b) un paquete
  npm separado/monorepo — rechazado por overkill para V1 (proyecto único).

## 2. Motor SQLite: `node:sqlite` integrado vs. `better-sqlite3`

- **Decisión**: Usar el módulo **integrado `node:sqlite`** (`DatabaseSync`) de
  Node 22. Verificado disponible en este entorno (Node **v22.20.0**), incluyendo
  ejecución ESM bajo `--experimental-strip-types`.
- **Rationale**: **Cero dependencias nativas nuevas** (no hay compilación de
  addon nativo ni problemas de binarios por plataforma en CI/Windows). API síncrona
  adecuada a escritura rara solo-admin y lectura intensiva. Soporta WAL,
  transacciones y funciones `json()`/`json_extract()` que necesita el adaptador.
- **Alternativas**: `better-sqlite3` — maduro y muy usado, pero **dependencia
  nativa** (build por plataforma) que no aporta ventaja funcional aquí. `sql.js`
  (WASM) — no persiste a disco de forma natural, inadecuado para durabilidad.
- **Riesgo aceptado**: `node:sqlite` emite `ExperimentalWarning` y su API “puede
  cambiar”. Mitigación: queda **detrás del puerto** (`sqlite-partner-repository.ts`);
  un cambio de API es un cambio localizado en un archivo, cubierto por la
  contract-test. Si madura o cambia, sustituir por `better-sqlite3` es cambiar el
  adaptador, sin tocar dominio ni handlers (FR-021).

## 3. Puerto de repositorio hexagonal + selección por configuración

- **Decisión**: Todo acceso a datos pasa por el puerto **`PartnerRepository`**
  (interface en `src/server/persistence/partner-repository.ts`). El SQL vive
  **solo** en el adaptador. La selección de adaptador se hace por
  **`PERSISTENCE_DRIVER=sqlite|postgres`** en una **factory** explícita
  (`persistence-config.ts`), invocada en el wiring del servidor.
- **Rationale**: Cumple FR-020 (límite único de acceso) y FR-021 (motor
  intercambiable). Aísla el dialecto/JSON para que el salto a Postgres (M2) sea un
  adaptador nuevo con `JSONB`, sin tocar dominio ni handlers. Es el análogo
  server-side de la regla del front “los componentes no inyectan `HttpClient`
  directo” (`ARCHITECTURE.md §3`).
- **Alternativas**: acceso directo a SQLite desde los handlers — rechazado: viola
  FR-020 y ataría el dominio al dialecto. Un ORM (Drizzle/Prisma) — rechazado para
  V1: agrega dependencia y capa de abstracción que el puerto ya cubre con menos
  superficie; reconsiderable en el adaptador Postgres si aporta valor.

## 4. Serialización del branding: JSON en columnas `TEXT`

- **Decisión**: `tokens`, `assets`, `legal`, `typography` se guardan como **JSON
  en columnas `TEXT`** en `partner_themes` (SQLite). El adaptador Postgres futuro
  usará `JSONB`.
- **Rationale**: Soporta la **aditividad** (FR-006): agregar un token opcional no
  requiere migración de esquema. Portable para el volcado SQLite→Postgres (M2). La
  paleta es de lectura como bloque (se sirve entera en la proyección), no se
  filtra por columnas individuales; `json_extract()` queda disponible si hiciera
  falta indexar un campo.
- **Alternativas**: una columna por token — rechazado: cada token nuevo obligaría
  a `ALTER TABLE` y rompería la aditividad. Tabla EAV de tokens — rechazado:
  complejidad innecesaria para un blob que se lee completo.

## 5. Atomicidad mutación + auditoría

- **Decisión**: Cada operación de escritura del puerto que muta datos escribe la
  fila de `audit_log` correspondiente en la **misma transacción** (`BEGIN`/`COMMIT`
  del adaptador). `audit_log` **no** es un puerto aparte.
- **Rationale**: FR-022 (todo-o-nada) y SC-005 (100% de versiones con auditoría).
  Garantiza que no exista una mutación sin su rastro ni un rastro sin su mutación.
- **Alternativas**: escribir auditoría en un segundo paso / fuera de transacción —
  rechazado: ventana de inconsistencia y posible pérdida del rastro ante fallo.

## 6. Durabilidad V1 — Litestream single-node

- **Decisión**: **Litestream** en modo **single-node** como sidecar:
  `litestream replicate` sube segmentos WAL al **bucket** cada `sync-interval`
  (~segundos); `litestream restore` reconstruye el SQLite **antes** de servir
  tráfico al arrancar/reiniciar. WAL mode activo.
- **Rationale**: FR-023 / SC-008 (RPO ~segundos, estado publicado sobrevive a
  reinicio). Es el caso de uso base de Litestream (backup+restore de un SQLite),
  sin primaria/réplica ni enrutamiento de escrituras (V1 = una sola instancia).
- **Alternativas**: backups periódicos con `cron`+`sqlite3 .backup` — rechazado:
  RPO de minutos/horas, no segundos. Réplica SQLite primaria/réplica — rechazado:
  innecesaria para una sola instancia (se difiere a Postgres en M2).
- **Nota de alcance**: Litestream es **operación/despliegue**, no código del repo.
  Se documenta en `quickstart.md`; la prueba de restore es un escenario de
  validación, no un test unitario.

## 7. Assets: object storage/CDN, solo URLs, validación y sanitización de SVG

- **Decisión**: El modelo guarda **solo URLs**; los binarios van a object
  storage/CDN. Esta feature define las **reglas de validación** (MIME, tamaño,
  dimensiones — `asset-validation.ts`) y la **sanitización/rechazo de SVG**
  (`svg-sanitize.ts`) como funciones puras reutilizables. La **intermediación real
  de la subida** (URLs firmadas / proxy server-side, credenciales del bucket) es
  **PRD 04 (BFF)** — fuera de esta feature.
- **Rationale**: FR-015/016/017 y SC-006 (cero binarios en BD). Separar las
  *reglas* (aquí, testeables en aislamiento) del *transporte* (BFF) mantiene el
  límite de alcance del spec (US4 define reglas; el mecanismo de subida es 04).
- **Alternativas**: guardar binarios en SQLite (BLOB) — rechazado por FR-015 y por
  hinchar el archivo replicado por Litestream. Implementar el cliente S3 aquí —
  rechazado: es transporte del BFF (PRD 04), no del modelo.
- **SVG**: sanitización por allow-list de elementos/atributos y remoción de
  `<script>`/`on*`/`href` peligrosos; si no se puede sanitizar con garantías, se
  **rechaza**. La librería concreta se elige en implementación (candidata:
  sanitización server-side); el contrato es “SVG servible = sin vectores activos”.

## 8. Theme por defecto (`__default__`)

- **Decisión**: Un partner sintético **`__default__`** con un `PartnerTheme` neutro
  de plataforma, definido en `server/theme/default-theme.ts`. Se sirve en el
  fallback de la resolución de tenant (slug desconocido, partner inactivo, raíz) y
  se marca **del sistema** (no editable estándar en el Back Office).
- **Rationale**: FR-018/019, SC-007 (fallback indistinguible, no revela partners).
  Es la contraparte del fallback de `001-resolucion-tenant-routing`.
- **Alternativas**: hardcodear el neutro en el front — rechazado: el contrato
  público debe ser el mismo shape para default y partners reales (fuente única).

## 9. Validación de `slug` — reutilizar el kernel de 001

- **Decisión**: El alta valida el `slug` con **unicidad** (índice único en BD) +
  **formato/normalización** y **no-reservado** reutilizando `normalizeSlug` e
  `isReservedSegment` del kernel `src/app/core/tenant/` de la feature 001.
- **Rationale**: FR-002 y coherencia con la resolución de tenant (evita crear un
  partner que colisione con el ruteo). Una sola definición de “slug válido”.
- **Nota**: `normalizeSlug`/`isReservedSegment` son funciones puras sin dependencia
  de Angular; se importan como utilidades. Si en implementación resultara que
  arrastran imports de Angular, se **promueven a `src/shared/`** (regla de
  promoción, `ARCHITECTURE.md §1/§6`) para consumirlas server-side.
- **Alternativas**: reimplementar la validación server-side — rechazado: duplicaría
  la regla y arriesgaría divergencia con el ruteo.

## 10. Estrategia de testing del servidor — `node:test` + type stripping

- **Decisión**: Los tests de servidor usan el runner integrado **`node:test`**,
  ejecutado con **`node --test --experimental-strip-types`** sobre archivos `.ts`.
  La **batería de contract-tests del puerto** (`partner-repository.contract-test.ts`)
  se ejecuta contra cada adaptador (SQLite hoy; Postgres en M2).
- **Rationale**: Karma+Jasmine (`ARCHITECTURE.md §9`) corre en **navegador** y no
  puede cargar `node:sqlite`/`fs`. `node:test` + type stripping ejecuta TS sin
  transpilación ni dependencia nueva (verificado con Node 22.20). La contract-test
  compartida es el **gate de la migración M2** (SC-009): un adaptador se acepta
  cuando pasa la misma batería.
- **Alternativas**: Jest/Vitest — rechazado: dependencia nueva y otro runner que el
  proyecto no usa. `ts-node`/`tsx` — innecesario dado el type stripping integrado.
  Correr persistencia bajo Karma — imposible (sin APIs de Node en navegador).
- **Coherencia con la Constitución**: es una **adición** para código que Karma no
  puede ejecutar, **no** un reemplazo del testing del front (que sigue en Karma).

## 11. E2E con Playwright CLI (pregunta explícita del usuario)

> El usuario pidió *“considera si es posible pruebas end-to-end utilizando
> playwright-cli”*. Respuesta honesta y su rationale:

- **Decisión**: **No aplica a esta feature.** Las pruebas E2E con Playwright **no
  son viables ni pertinentes aquí**; la validación E2E de esta feature se hace con
  **contract-tests del puerto** (`node:test`), **test de la proyección pública**
  (shape + exclusión de campos sensibles) y la **prueba de durabilidad** (restore
  de Litestream, escenario de `quickstart.md`).
- **Rationale**:
  1. **No hay superficie de navegador.** Playwright automatiza un browser
     (o su `request` API contra un servidor HTTP). Esta feature entrega **dominio +
     persistencia + tipos**; **no** renderiza UI ni expone un endpoint HTTP propio
     (el BFF `GET /api/theme/:slug` es **PRD 04**, fuera de alcance). Sin URL que
     navegar ni endpoint que golpear, no hay “extremo a extremo” que ejercitar con
     Playwright.
  2. **El “end-to-end” real de esta feature es de datos**, no de UI:
     `crear → guardar versión → publicar → leer proyección pública → rollback` y
     `reiniciar → restore → estado vigente disponible`. Eso se cubre mejor con la
     contract-test del repositorio y el escenario de restore.
  3. **Convención del proyecto** (`ARCHITECTURE.md §9`): Playwright CLI es una
     **herramienta de verificación manual del agente** (feedback visual/validación
     de flujos), **no** el framework de pruebas automatizadas del proyecto. Esta
     feature no cambia esa postura.
- **Cuándo sí aplicará Playwright** (features posteriores, con superficie real):
  - **PRD 03 — Theming/anti-FOUC del front**: hay UI navegable; Playwright *podría*
    verificar visualmente que dos partners (Popular/Occidente) aplican tokens
    distintos y que no hay parpadeo (FOUC). Sigue siendo *verificación del agente*,
    no suite automatizada, salvo decisión explícita futura.
  - **PRD 05 — Back Office**: flujos de alta/edición/publicación/rollback en UI —
    el terreno natural de un E2E de navegador.
  - **PRD 04 — BFF**: cuando exista `GET /api/theme/:slug`, Playwright podría usar
    su **APIRequestContext** para un smoke E2E del endpoint (aunque la validación
    de shape ya la cubre el test de proyección de esta feature).
- **Alternativas consideradas**: (a) levantar un servidor HTTP mínimo *solo* para
  poder correr Playwright contra él — rechazado: inventaría transporte que es PRD 04
  y no prueba nada que la contract-test no cubra ya. (b) Playwright `request` contra
  un stub — rechazado: mismo motivo, sin valor incremental.

## 12. Dos vistas de `Partner` (front read-projection vs. canónico server)

- **Decisión**: Mantener **separadas** la `Partner` estrecha del front
  (`src/app/features/partners/models/partner-model.ts` de 001: `slug`, `status`,
  `displayName?`, para el guard de ruteo) y la **`Partner` canónica** server-side
  de esta feature (`src/shared/partner/partner-model.ts`: `id`, `slug`,
  `displayName`, `status`, `themeId`, timestamps, actores).
- **Rationale**: El front nunca debe ver `id`, `themeId` ni metadatos de auditoría
  (FR-007). Son dos contratos distintos con dos audiencias; fusionarlos filtraría
  campos internos al cliente. La `PublicTheme` es el puente que el front consume.
- **Alternativas**: un solo tipo compartido — rechazado por la razón anterior.
