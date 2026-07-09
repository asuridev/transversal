# Contract — Batería de contract-tests del repositorio (compartida)

Una **única batería** que se ejecuta contra **cualquier** adaptador de
`PartnerRepository`. Es el **gate de aceptación** de todo adaptador (SC-009): el
adaptador SQLite hoy y el Postgres en M2 deben pasar **la misma** batería sin
cambios en dominio ni handlers. Prueba **comportamiento observable**, no SQL.

- Archivo de la batería: `src/server/persistence/partner-repository.contract-test.ts`
  — exporta una función `runPartnerRepositoryContract(makeRepo: () => Promise<PartnerRepository>)`.
- Runner: `node:test` con `node --test --experimental-strip-types` (ver
  `research.md §10`). Cero dependencias nuevas.
- El test del adaptador SQLite (`sqlite/sqlite-partner-repository.test.ts`) importa
  la batería y le pasa una factory que crea el repo sobre una **BD temporal**
  (`node:sqlite` en archivo temporal en el scratchpad/`os.tmpdir()`), aislada por test.

## Forma

```typescript
// partner-repository.contract-test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PartnerRepository } from './partner-repository';

export function runPartnerRepositoryContract(makeRepo: () => Promise<PartnerRepository>) {
  describe('PartnerRepository (contract)', () => {
    // … casos de abajo …
  });
}
```

```typescript
// sqlite/sqlite-partner-repository.test.ts
import { runPartnerRepositoryContract } from '../partner-repository.contract-test';
import { SqlitePartnerRepository } from './sqlite-partner-repository';
runPartnerRepositoryContract(async () => new SqlitePartnerRepository(':memory:' /* o temp file */));
```

## Casos (trazados a acceptance scenarios / FR / SC)

| # | Caso | Aserción | Trazabilidad |
|---|------|----------|--------------|
| 1 | Alta persiste Partner + Theme v1 borrador atómicamente | `createPartner` ⇒ partner `active`, `themeId=null`; theme `version=1`, `publishedAt=null` | US1 esc.1, FR-010/022 |
| 2 | Slug duplicado se rechaza | segundo `createPartner` con mismo slug ⇒ error `UniqueSlug`; no persiste | US1 esc.2, FR-002 |
| 3 | Slug inmutable | no existe método que cambie `slug` (verificación de superficie del puerto) | US1 esc.4, FR-002 |
| 4 | `getPublishedTheme` no sirve borradores | tras solo `createPartner` (v1 borrador) ⇒ `getPublishedTheme(slug)` = `null` | US2 esc.3, FR-011 |
| 5 | Publicar mueve el puntero | `saveThemeVersion`→v… luego `publishThemeVersion` ⇒ `Partner.themeId` = esa versión; `getPublishedTheme` la devuelve con su `version` | US3 esc.2, FR-012 |
| 6 | Guardar crea v2 sin tocar v1 publicada | con v1 publicada, `saveThemeVersion` ⇒ v2 borrador; `getPublishedTheme` sigue devolviendo v1 | US3 esc.1, FR-010 |
| 7 | Rollback re-publicando v1 | publicar v2, luego `publishThemeVersion(v1)` ⇒ `getPublishedTheme` = v1; v2 sigue existiendo | US3 esc.3, FR-013 |
| 8 | Historial completo preservado | tras varias versiones, todas existen (ninguna borrada) | SC-004 |
| 9 | Cada versión con auditoría | tras cada mutación, hay fila en `audit_log` con actor y timestamp | SC-005, FR-014/022 |
| 10 | Atomicidad: fallo revierte todo | forzar fallo tras insertar entidad y antes de audit ⇒ ni entidad ni audit persisten (o viceversa) | FR-022 |
| 11 | Partner inactivo no es servible | `deactivatePartner` ⇒ `getPublishedTheme(slug)` = `null`; `findActiveSlugs` no lo incluye | US2 esc.4, FR-003 |
| 12 | Baja lógica, no física | tras `deactivatePartner`, `findBySlug` sigue devolviendo el partner con `status='inactive'` | FR-003 |
| 13 | `findActiveSlugs` solo activos | devuelve solo slugs de partners `active` | feature 001 |
| 14 | `__default__` no se lista | `listPartners` no incluye el partner del sistema | US5 esc.2, FR-019 |
| 15 | Dos marcas, mismo esquema | crear Popular (verde) y Occidente (azul) con los tokens del Anexo A ⇒ ambos válidos sin cambios de esquema; sus `PublicTheme` tienen el mismo set de claves | FR-009, SC-003 |
| 16 | Assets solo URL | `assets.*Url` son strings; ningún binario se persiste | FR-015, SC-006 |

## Test de la proyección pública (unitario, `node:test`)

Independiente del repositorio (función pura `toPublicTheme`):

| # | Caso | Aserción | Trazabilidad |
|---|------|----------|--------------|
| P1 | Shape exacto | claves de `toPublicTheme(theme, partner)` = `{slug,displayName,version,tokens,assets,legal,typography}` | SC-001, FR-007 |
| P2 | Cero fugas | ninguna clave interna (`id`, `partnerId`, `themeId`, `createdBy`, `publishedAt`, `status`, timestamps) aparece | FR-007, US2 esc.2 |
| P3 | Dos marcas mismo shape | `toPublicTheme` de Popular y de Occidente producen idéntico set de claves | FR-009, SC-003 |

## Durabilidad (escenario, NO test unitario)

La restauración (Litestream `restore`) se valida como escenario operativo en
`quickstart.md` (SC-008), no en `node:test`.

## E2E con Playwright — no incluido (justificación)

Esta batería **es** el "extremo a extremo" de la feature (de la mutación a la
lectura servible). No hay E2E de navegador porque la feature no expone UI ni
endpoint HTTP propio; ver `research.md §11`. Playwright se difiere a PRD 03/05.
