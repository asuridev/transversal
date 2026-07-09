# Phase 1 — Data Model: Modelo de Partner y Contrato de Theme

Deriva las entidades del spec (Key Entities) y del PRD 02. Los tipos aquí son la
**única fuente de verdad del shape** (FR-008); la DDL concreta está en
`contracts/persistence-schema.contract.md`.

---

## Entidades

### 1. `Partner` (canónico, server-side)

Identidad y estado del banco distribuidor. Unidad del catálogo multi-tenant.

| Campo         | Tipo                     | Reglas                                                                 |
|---------------|--------------------------|-----------------------------------------------------------------------|
| `id`          | `string` (UUID)          | Interno, **nunca** en la URL ni en el contrato público (FR-007).      |
| `slug`        | `string` (kebab-case)    | **Único** e **inmutable** (FR-002); normalizado y **no reservado** (§9 research, coherente con 001). |
| `displayName` | `string`                 | Nombre visible ("Banco Popular").                                     |
| `status`      | `'active' \| 'inactive'` | Baja **lógica** (FR-003); nunca `DELETE` físico. `inactive` ⇒ fallback.|
| `themeId`     | `string \| null` (UUID)  | Puntero a la versión de theme **publicada vigente** (FR-012). `null` mientras no haya publicación. |
| `createdAt`   | `string` (ISO-8601)      | Auditoría (FR-001).                                                    |
| `updatedAt`   | `string` (ISO-8601)      | Auditoría.                                                            |
| `createdBy`   | `string` (sub usuario)   | Auditoría (quién) — PRD 06.                                            |
| `updatedBy`   | `string`                 | Auditoría.                                                            |

Tipos de entrada asociados:
- `NewPartner`: `{ slug; displayName; createdBy }` (estado inicial `active`,
  `themeId=null`, timestamps generados).
- `PartnerQuery`: filtros de listado del Back Office (p. ej. `{ status?, limit?, offset? }`).

**Invariantes**:
- `slug` inmutable: no existe operación en el puerto que lo modifique (US1 esc. 4).
- Un `Partner` siempre existe con **al menos** una versión de theme tras el alta
  (US1: se persiste `Partner` + `PartnerTheme` v1 en borrador atómicamente).

### 2. `PartnerTheme` (una *versión* del branding)

Todo el branding configurable de un partner. **No contiene lógica** (FR-004).

| Campo         | Tipo                | Reglas                                                                 |
|---------------|---------------------|------------------------------------------------------------------------|
| `id`          | `string` (UUID)     | UUID de **esta versión** de theme.                                     |
| `partnerId`   | `string` (UUID)     | FK a `Partner.id`.                                                     |
| `version`     | `number`            | Incremental por partner (1, 2, 3…), único con `partnerId` (FR-010).   |
| `tokens`      | `ThemeTokens`       | Paleta de color (ver abajo).                                           |
| `assets`      | `ThemeAssets`       | URLs de binarios (FR-015).                                            |
| `legal`       | `ThemeLegal`        | Textos legales.                                                       |
| `typography`  | `ThemeTypography`   | Familia + fuente custom opcional.                                     |
| `publishedAt` | `string \| null`    | `null` = **borrador**; fecha ISO = **publicado** (FR-011).            |
| `createdBy`   | `string`            | Quién creó la versión (FR-014, SC-005).                               |
| `createdAt`   | `string` (ISO-8601) | Cuándo (FR-014).                                                      |

Tipo de entrada:
- `NewThemeVersion`: `{ tokens; assets; legal; typography; createdBy }`
  (el `version` lo asigna el repositorio: `max(version)+1` por partner; nace en
  borrador con `publishedAt=null`).

**Sub-tipos (paleta mínima, aditiva — FR-006):**

```typescript
interface ThemeTokens {
  colorPrimary: string;        // hex, p.ej. "#00A056" (Popular) / "#008ACC" (Occidente)
  colorPrimaryTint: string;
  colorSecondary: string;
  colorSecondaryTint: string;
  colorTextStrong: string;
  colorTextMuted: string;
  colorSurface: string;
  colorBorder: string;
  // paleta MÍNIMA; se amplía con campos OPCIONALES sin romper consumidores (FR-006)
  [extraToken: string]: string | undefined;   // aditividad explícita
}

interface ThemeAssets {
  logoUrl: string;             // logo del producto (header)
  faviconUrl: string;
  coBrandBankLogoUrl: string;  // logo del banco (footer co-branded)
  coBrandGroupLogoUrl?: string;// logo del grupo, opcional
  ogImageUrl?: string;         // open graph / share, opcional
}

interface ThemeLegal {
  footerDisclaimer: string;    // p.ej. "Vigilado por la Superintendencia Financiera de Colombia."
  termsUrl?: string;
  privacyUrl?: string;
}

interface ThemeTypography {
  fontFamily: string;          // p.ej. "Poppins"
  fontUrlWoff2?: string;       // fuente custom por partner, opcional (self-hosted)
}
```

**Invariantes**:
- `(partnerId, version)` único (FR-010): guardar nunca sobrescribe; incrementa.
- Una versión en borrador (`publishedAt=null`) **no** es servible al front (FR-011,
  US2 esc. 3).
- Publicar sin cambios (versión idéntica) no corrompe historial ni puntero
  (Edge Case; el guardado siempre crea una versión nueva y publicar solo mueve
  `themeId`).

### 3. `PublicTheme` (proyección pública — contrato de consumo del front)

Vista derivada del `PartnerTheme` **publicado** vigente. **Excluye** `id`,
`partnerId`, `createdBy`, credenciales y endpoints (FR-007, SC-001). Es el shape
que consume el front (PRD 03/04) y el Back Office para previsualizar.

```typescript
interface PublicTheme {
  slug: string;          // del Partner
  displayName: string;   // del Partner
  version: number;       // de la versión publicada servida
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
}
```

Función de proyección (pura): `toPublicTheme(theme: PartnerTheme, partner: Partner): PublicTheme`.
Detalle y ejemplo en `contracts/public-theme-projection.contract.md`.

### 4. `AuditEntry` (registro de auditoría)

Documenta quién hizo qué cambio y cuándo sobre partners/themes. Se persiste en la
**misma transacción** que la mutación que describe (FR-022). Formato/consulta
detallados son PRD 06; aquí solo se garantiza que **porta** la información y se
escribe atómicamente.

| Campo       | Tipo                | Reglas                                             |
|-------------|---------------------|----------------------------------------------------|
| `id`        | `string` (UUID)     |                                                    |
| `entity`    | `'partner' \| 'partner_theme'` | Sobre qué entidad.                      |
| `entityId`  | `string`            | `id` de la entidad mutada.                         |
| `action`    | `'create' \| 'save_version' \| 'publish' \| 'deactivate'` | Qué acción. |
| `actorSub`  | `string`            | Quién (sub del usuario).                           |
| `diff`      | `string` (JSON)     | Cambio (opcional/resumen; formato final PRD 06).   |
| `at`        | `string` (ISO-8601) | Cuándo.                                            |

### 5. Theme por defecto de plataforma (`__default__`)

Partner sintético `__default__` (slug reservado, marcado del sistema) con un
`PartnerTheme` neutro. Servido en fallback (FR-018, SC-007). No editable estándar
en el Back Office (FR-019). Definido en código (`server/theme/default-theme.ts`),
no como fila administrable normal.

### 6. Asset de marca (referenciado por URL)

No es una tabla: es cada binario (logo, favicon, imagen, fuente) alojado en object
storage/CDN y **referenciado por URL** desde `ThemeAssets`. Reglas de validación
(MIME/tamaño/dimensiones) y sanitización de SVG en `server/assets/` (FR-016). La
rotura de una URL no corrompe el registro del theme (Edge Case): el modelo solo
guarda strings.

---

## Relaciones

```
Partner 1 ──────< N PartnerTheme        (partner_themes.partner_id → partners.id)
Partner.themeId ──────> 1 PartnerTheme  (puntero a la versión PUBLICADA vigente; nullable)
Partner / PartnerTheme ──> N AuditEntry (audit_log.entity_id, mismo tx que la mutación)
```

- Un `Partner` tiene **N** versiones de theme (historial completo, nunca se borra).
- `Partner.themeId` apunta a **una** versión publicada (la vigente). Rollback =
  mover `themeId` a una versión anterior existente (FR-013).

---

## Transiciones de estado

### Estado de `Partner.status`

```
(alta) ──> active ──(deactivatePartner)──> inactive
             ^                                  │
             └──────────(reactivación*)─────────┘
```
- La baja es **lógica** (`inactive`), nunca borrado físico (FR-003). Un `inactive`
  cae al fallback y su theme **no** es servible (US2 esc. 4), sin revelar que
  existe.
- *Reactivación: no está en los FR de esta feature; si se requiere, es una mutación
  del Back Office (PRD 05) que respeta estas reglas. No se modela borrado.

### Estado de una versión de `PartnerTheme` (borrador → publicado)

```
save (nueva versión) ──> BORRADOR (publishedAt = null)
                              │  publishThemeVersion
                              ▼
                          PUBLICADO (publishedAt = fecha)  ──> Partner.themeId = esta versión
```
- **Guardar** siempre crea una versión **nueva** en borrador; la publicada vigente
  sigue sirviéndose intacta (US3 esc. 1, FR-010/011).
- **Publicar** mueve `Partner.themeId` a la versión elegida y sella `publishedAt`
  (US3 esc. 2, FR-012). El historial anterior se conserva.
- **Rollback** = `publishThemeVersion` sobre una versión anterior existente; no se
  pierde historial (US3 esc. 3, FR-013). Re-publicar puede re-sellar `publishedAt`
  a la fecha de re-publicación (una versión puede haber estado publicada antes).
- El front **solo** sirve la versión referenciada por `themeId` (publicada); nunca
  un borrador (FR-011).

---

## Reglas de validación (resumen, trazadas a FR)

| Regla                                                        | FR / escenario         |
|-------------------------------------------------------------|------------------------|
| `slug` único (índice único en BD)                           | FR-002, US1 esc. 2     |
| `slug` con formato válido y **no reservado** (kernel 001)   | FR-002, US1 esc. 3     |
| `slug` inmutable (sin operación de cambio)                  | FR-002, US1 esc. 4     |
| Baja lógica; nunca borrado físico                           | FR-003                 |
| Guardar crea versión nueva; no sobrescribe                  | FR-010, US3 esc. 1     |
| Solo versiones publicadas son servibles                     | FR-011, US2 esc. 3     |
| Publicar mueve `themeId`; conserva historial                | FR-012, US3 esc. 2     |
| Rollback = re-publicar versión previa; sin pérdida          | FR-013, US3 esc. 3     |
| Cada versión registra quién/cuándo                          | FR-014, SC-005         |
| Proyección pública sin campos internos sensibles            | FR-007, SC-001         |
| Mismo contrato representa marcas distintas (Popular/Occidente)| FR-009, SC-003, Anexo A|
| Tokens/assets opcionales no rompen consumidores             | FR-006, Edge Case      |
| Assets solo por URL; binarios fuera de BD                   | FR-015, SC-006         |
| Validación de asset + sanitización SVG                      | FR-016, US4 esc. 2/3   |
| Mutación + auditoría atómicas                               | FR-022                 |
| Config publicada durable (sobrevive reinicio, RPO ~seg)     | FR-023, SC-008         |

---

## Mapeo de marcas de validación (Anexo A del spec → `ThemeTokens`)

Evidencia de FR-009 / SC-003: **el mismo esquema** expresa dos marcas opuestas
solo cambiando valores (verde vs. azul). Sirve de fixture para los contract-tests.

| Token del contrato   | Banco Popular | Banco Occidente |
|----------------------|---------------|-----------------|
| `colorPrimary`       | `#00A056`     | `#008ACC`       |
| `colorPrimaryTint`   | `#E9F0D6`     | `#B6ECFF`       |
| `colorSecondary`     | `#8FB434`     | `#002449`       |
| `colorSecondaryTint` | `#D2E1AE`     | `#CCD3DB`       |
| `colorTextStrong`    | `#000000`     | `#262626`       |
| `colorTextMuted`     | `#808080`     | `#808080`       |
| `colorSurface`       | `#FFFFFF`     | `#FFFFFF`       |
| `colorBorder`        | `#EBEBEB`     | `#CCCCCC`       |
| `fontFamily`         | `Poppins`     | `Poppins`       |
