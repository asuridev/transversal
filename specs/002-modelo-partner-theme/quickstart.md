# Quickstart — Validación: Modelo de Partner y Contrato de Theme

Guía de **validación ejecutable** que prueba la feature de extremo a extremo (de
la mutación a la lectura servible + durabilidad). No incluye implementación: los
detalles del shape/DDL están en `contracts/` y `data-model.md`.

> **Sobre E2E con Playwright**: esta feature **no** tiene E2E de navegador (no
> renderiza UI ni expone endpoint HTTP propio; el BFF es PRD 04). Su "extremo a
> extremo" es la **contract-test del repositorio** + el **test de proyección
> pública** + la **prueba de restore**. El E2E con Playwright se difiere a PRD 03
> (theming del front) y PRD 05 (Back Office). Ver `research.md §11`.

## Prerrequisitos

- **Node 22.20+** (verificado en este entorno: `node -v` → `v22.20.0`). Aporta
  `node:sqlite` y `node:test` integrados, y `--experimental-strip-types` para
  ejecutar `.ts` sin transpilar. **Sin dependencias npm nuevas.**
- **(Solo durabilidad)** binario **Litestream** y un bucket S3-compatible o MinIO
  local. Opcional para los escenarios 1–5; requerido para el escenario 6.

## Ejecutar los contract-tests (escenarios 1–5, automatizados)

```bash
# Batería del puerto contra el adaptador SQLite + test de proyección pública
node --test --experimental-strip-types "src/server/**/*.test.ts" "src/shared/**/*.test.ts"
```

Salida esperada: todos los casos de `contracts/repository-contract-tests.md`
(1–16) y de proyección (P1–P3) en verde. Estos casos **son** la validación
funcional de la feature (M1, instancia única).

> Nota: el glob `**` puede requerir la versión de Node/OS que lo soporte en
> `--test`; si no, listar los archivos o usar `--test` con `--import` de un
> runner-index. En Windows/PowerShell, entrecomillar los globs.

## Escenario 1 — Alta de partner con branding (US1, FR-001/002/010)

1. Validar el `slug` (formato + no reservado) con el kernel de 001
   (`normalizeSlug`, `isReservedSegment`) **antes** de llamar al puerto.
2. `createPartner({ slug:'popular', displayName:'Banco Popular', createdBy })`
   con `firstTheme` = tokens de Popular (Anexo A).
3. **Esperado**: se persisten `Partner` (`active`, `themeId=null`) + `PartnerTheme`
   `version=1` `publishedAt=null` (borrador), **atómicamente**, con fila en
   `audit_log`. Reintentar con `slug:'popular'` ⇒ error `UniqueSlug`.

## Escenario 2 — Servir el theme público (US2, FR-007/011, SC-001)

1. Publicar la v1: `publishThemeVersion(partnerId, themeV1Id)`.
2. `getPublishedTheme('popular')` ⇒ `PartnerTheme` publicado; aplicar
   `toPublicTheme(theme, partner)`.
3. **Esperado**: el `PublicTheme` tiene **exactamente**
   `{slug, displayName, version, tokens, assets, legal, typography}` y **ningún**
   campo interno (`id`, `partnerId`, `themeId`, `createdBy`, `publishedAt`,
   `status`, timestamps). Un partner con solo borradores ⇒ `getPublishedTheme` =
   `null` (no se sirve borrador).

## Escenario 3 — Versionado, publicación y rollback (US3, FR-010/012/013, SC-004)

1. Con v1 publicada, `saveThemeVersion(partnerId, v2)` ⇒ v2 borrador; el front
   sigue sirviendo v1.
2. `publishThemeVersion(partnerId, v2Id)` ⇒ `Partner.themeId=v2`; `getPublishedTheme`
   devuelve v2.
3. **Rollback**: `publishThemeVersion(partnerId, v1Id)` ⇒ `getPublishedTheme`
   vuelve a v1; **v2 sigue existiendo** en el historial (nada se pierde).
4. **Esperado**: cada versión conserva `createdBy`/`createdAt` (SC-005).

## Escenario 4 — Dos marcas, mismo contrato (FR-009, SC-003, Anexo A)

1. Crear `occidente` (Banco de Occidente) con los tokens **azules** del Anexo A.
2. Proyectar Popular (verde) y Occidente (azul) a `PublicTheme`.
3. **Esperado**: **mismo set de claves** en ambos, solo cambian los valores. El
   esquema no cambió para representar dos marcas opuestas.

## Escenario 5 — Partner inactivo y fallback (US2 esc.4 / US5, FR-003/018, SC-007)

1. `deactivatePartner(partnerId)` (baja **lógica**).
2. **Esperado**: `getPublishedTheme('popular')` = `null`; `findActiveSlugs` no lo
   incluye; `findBySlug` aún lo devuelve con `status='inactive'` (no borrado
   físico). El fallback sirve el `PublicTheme` de `__default__` con el mismo shape,
   indistinguible (no revela que 'popular' existe).

## Escenario 6 — Durabilidad / restore (FR-023, SC-008) — requiere Litestream

1. Con Litestream replicando `partners.db` al bucket (`sync-interval: 1s`), crear/
   publicar un theme.
2. Simular caída: descartar el disco local (o recrear el contenedor).
3. Al arrancar: `litestream restore -if-replica-exists /data/partners.db` **antes**
   de servir tráfico.
4. **Esperado**: `getPublishedTheme(slug)` reproduce el **estado publicado vigente**
   previo a la caída, con pérdida acotada a la ventana de `sync-interval` (RPO
   ~segundos).

## Validación de assets (US4, FR-016) — reglas, sin transporte

- `asset-validation.ts`: un archivo que excede tamaño / MIME / dimensiones ⇒
  rechazado con mensaje claro. Un logo válido ⇒ aceptado; el theme guarda **solo la
  URL** (nunca el binario) — verificable por unit test.
- `svg-sanitize.ts`: un SVG con `<script>`/`on*`/`href` peligroso ⇒ sanitizado o
  rechazado antes de quedar servible.
- La **subida real** (URLs firmadas / proxy, credenciales del bucket) es PRD 04
  (BFF) — fuera de esta feature; aquí solo se validan las **reglas**.

## Mapa de trazabilidad rápida

| Escenario | User Story | FR / SC clave |
|-----------|-----------|---------------|
| 1 | US1 | FR-001/002/010/022 |
| 2 | US2 | FR-007/011, SC-001 |
| 3 | US3 | FR-010/012/013/014, SC-004/005 |
| 4 | Edge/US2 | FR-006/009, SC-003 |
| 5 | US2/US5 | FR-003/018/019, SC-007 |
| 6 | Edge | FR-023, SC-008 |
| Assets | US4 | FR-015/016/017, SC-006 |
