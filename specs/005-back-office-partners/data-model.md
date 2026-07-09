# Phase 1 — Data Model: Back Office — Gestión de Partners

Modelos **front-end** de la feature `admin`. No define persistencia: los tipos
canónicos (`Partner`, `PartnerTheme`, `ThemeTokens`, `ThemeAssets`,
`ThemeLegal`, `ThemeTypography`, `PublicTheme`) son de `002`
(`src/shared/partner/`) y esta feature **los reutiliza**. Aquí viven solo los
**DTOs de administración** (shapes de request/response de `/api/admin/*`) y el
**estado de UI** (borrador de edición, filtro, contraste). Ubicación:
`src/app/features/admin/models/partner-admin-model.ts`.

---

## 1. DTOs de administración (contrato con `/api/admin/*`)

### `PartnerListItem` — fila del listado (US1, FR-001)

Respuesta de `GET /api/admin/partners`. **No** incluye secretos (FR-016): el BFF
solo expone metadatos.

| Campo                  | Tipo                       | Origen / Reglas                                              |
|------------------------|----------------------------|-------------------------------------------------------------|
| `slug`                 | `string`                   | Identificador visible (kebab-case).                         |
| `displayName`          | `string`                   | Nombre visible.                                             |
| `status`               | `'active' \| 'inactive'`   | Estado (badge en la UI).                                    |
| `credentialConfigured` | `boolean`                  | Metadato de credencial (nunca el secreto) — `004`/FR-016.   |
| `currentVersion`       | `number \| null`           | Versión de theme vigente; `null` si aún sin publicar.       |
| `updatedAt`            | `string` (ISO-8601)        | Última modificación (auditoría).                            |
| `updatedBy`            | `string`                   | Autor del último cambio (auditoría, PRD 06).                |

> Nota: `currentVersion`/`updatedAt`/`updatedBy` provienen del `Partner`
> canónico (`002`). Si el endpoint `GET /api/admin/partners` de `004` aún no los
> proyecta, es un ajuste menor de proyección en el BFF, no un cambio de contrato
> del panel. El panel los consume tal cual.

### `PartnerDetail` — partner + versiones (US3/US4)

Respuesta al abrir el editor. Reúne el `Partner` con su versión vigente y el
borrador en curso (si existe).

| Campo             | Tipo                       | Reglas                                                     |
|-------------------|----------------------------|------------------------------------------------------------|
| `id`              | `string` (UUID)            | Interno; usado en las rutas de mutación (`:id`).           |
| `slug`            | `string`                   | Inmutable tras el alta.                                    |
| `displayName`     | `string`                   |                                                            |
| `status`          | `'active' \| 'inactive'`   |                                                            |
| `publishedTheme`  | `PartnerTheme \| null`     | Versión vigente (`publishedAt != null`); `null` sin publicar. |
| `draftTheme`      | `PartnerTheme \| null`     | Última versión en borrador (`publishedAt == null`), si hay. |

### `CreatePartnerRequest` — alta (US2, FR-004/005/006)

`POST /api/admin/partners`.

| Campo         | Tipo     | Validación cliente (feedback) / servidor (autoritativo)                        |
|---------------|----------|--------------------------------------------------------------------------------|
| `slug`        | `string` | Formato kebab (reglas `001`/`002`) + **no reservado**; unicidad → BFF (FR-005). |
| `displayName` | `string` | Requerido, no vacío (FR-004, US2.5).                                            |

Respuesta: `{ partner: Partner; theme: PartnerTheme }` — partner **inactivo** +
theme **v1 en borrador** basado en el default (FR-006).

### `SaveThemeVersionRequest` — guardar borrador (US3, FR-013)

`PATCH /api/admin/partners/:id`. Body = `NewThemeVersion` (de `002`) sin
`createdBy` (lo pone el BFF desde la sesión):

```typescript
type SaveThemeVersionRequest = {
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
};
```

Respuesta: `PartnerTheme` (nueva versión en borrador; `version = max+1`).

### `PublishRequest` — publicar (US4, FR-014)

`POST /api/admin/partners/:id/publish` con `{ themeId: string }`. Respuesta
`{ ok: true }`. Mueve el puntero vigente e invalida la caché pública (`003`).

### `AssetUploadRequest` / `StoredAssetRef` — assets (FR-009)

`POST /api/admin/assets`:

```typescript
type AssetUploadRequest = {
  key?: string;         // opcional; el BFF genera uno si falta
  mimeType: string;     // validado server-side (004)
  base64: string;       // binario del asset
};
type StoredAssetRef = { url: string; key: string };  // públicos; SIN credenciales del bucket
```

La `url` devuelta se coloca en el campo de asset correspondiente del `ThemeDraft`.

### `AuditEntry` — historial (lectura, PRD 06)

`GET /api/admin/audit` → lista de entradas `{ actor, action, targetSlug, at }`
(shape detallado es propiedad de PRD 06; el panel solo lo lista si se muestra).

---

## 2. Estado de UI (síncrono, local — no server-state)

### `ThemeDraft` — borrador en edición (Const. I → signal local, D5)

Espejo editable del `PartnerTheme` mientras el operador ajusta la marca. Vive en
un `signal`/Reactive Form del `partner-edit`; **no** entra a TanStack Query hasta
guardar.

```typescript
interface ThemeDraft {
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
}
```

**Derivados (`computed`)**:
- `previewCssVars: Record<string,string>` = `toCssVars({ …draft })` (`003`) →
  alimenta el host aislado del `theme-preview` (D1).
- `isDirty: boolean` = borrador ≠ versión cargada.
- `contrastWarnings: ContrastWarning[]` = pares token/superficie que no cumplen AA.

**Invariantes**:
- El borrador **nunca** escribe a `:root` ni al `ThemeStore` global (SC-009).
- `slug` no es editable en el editor (inmutable tras el alta).

### `ContrastWarning` — advertencia AA (FR-008, D2)

```typescript
interface ContrastWarning {
  tokenKey: string;      // p. ej. 'colorTextStrong'
  againstKey: string;    // superficie contra la que se evalúa, p. ej. 'colorSurface'
  ratio: number;         // ratio calculado (WCAG 2.1)
  minimum: number;       // umbral AA (4.5 texto normal)
}
```

Es **advertencia**, no error de formulario: no invalida el form ni bloquea
guardar/publicar (FR-008).

### `PartnersListFilter` — buscador (US1, D7)

```typescript
interface PartnersListFilter {
  query: string;                       // texto del buscador
  status?: 'active' | 'inactive';      // filtro opcional por estado
}
```

Aplicado en cliente sobre la lista cacheada (`computed()`); estado vacío
explícito cuando no hay coincidencias (Edge Case).

---

## 3. Máquina de estados del ciclo de vida (referencia)

El panel **refleja** las transiciones que ejecuta el BFF/repositorio (`002`); no
las implementa. Se documentan para guiar los estados de la UI:

```
[Alta] ──► Partner(status=inactive, themeId=null) + PartnerTheme v1 (draft)
                     │
        (editar → PATCH) crea PartnerTheme vN (draft)   ◄─┐  guardar repetido
                     │                                     │  incrementa versión
        (publicar → publish) themeId = vN, vN.publishedAt = now
                     │
        Partner servible en la experiencia pública (si status=active)
                     │
   (desactivar) status=inactive  ◄──►  (reactivar) status=active
        │
   nunca DELETE físico (FR-015/016, SC-006)
```

Estados que la UI distingue:
- **Sin publicar** (`currentVersion == null`): badge "Borrador"; publicar
  habilitado si hay draft.
- **Publicado con borrador pendiente** (`draftTheme != null` y
  `publishedTheme != null`): botón "Publicar" activo, "Guardar" crea otra versión.
- **Publicado sin cambios** (`draftTheme == null`): "Publicar" deshabilitado
  ("nada nuevo que publicar", US4.3).
- **Activo / Inactivo**: badge + acción de alternar.

---

## 4. Relación con contratos existentes (no se redefinen)

| Tipo | Fuente | Uso en `admin` |
|------|--------|----------------|
| `Partner` | `src/shared/partner/partner-model.ts` (`002`) | Base de `PartnerListItem`/`PartnerDetail` |
| `PartnerTheme` + sub-tipos | `src/shared/partner/partner-theme-model.ts` (`002`) | Editado por el `brand-editor` |
| `PublicTheme` / `toPublicTheme` | `src/shared/partner/` (`002`) | Shape del preview (equivale a lo que verá el cliente) |
| `toCssVars` | `src/app/core/theme/theme-css-vars.ts` (`003`) | Proyección de tokens → `--brand-*` del preview |
| Endpoints `/api/admin/*` | `src/server/api/admin-router.ts` (`004`) | Backend consumido por `AdminApiService` |

Los DTOs de admin son **vistas de request/response**; cualquier ajuste de shape
del dominio se hace en `002`, no aquí.
