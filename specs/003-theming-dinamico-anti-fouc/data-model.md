# Data Model — Theming Dinámico y Anti-FOUC

**Feature**: `003-theming-dinamico-anti-fouc` | **Date**: 2026-07-04

Esta feature **no** define entidades de persistencia nuevas: consume el
contrato `PublicTheme` de la feature `002` (`src/shared/partner/`) y el
`TenantResolution` de la feature `001` (`src/app/core/tenant/`). Los "modelos"
aquí son **estado de UI** (síncrono) y **estructuras de transferencia/derivadas**
que viven en el front. Las entidades de dominio/persistencia siguen siendo las
de `002` (`Partner`, `PartnerTheme`) y no se redefinen.

---

## 1. Entrada consumida (definida en otras features — solo referencia)

### `PublicTheme` (feature `002`, `src/shared/partner/public-theme-model.ts`)

Proyección pública del theme publicado vigente. Es la **entrada** que este motor
aplica. Shape (no se modifica aquí):

```typescript
interface PublicTheme {
  slug: string;
  displayName: string;
  version: number;          // clave de cache-busting (D8)
  tokens: ThemeTokens;      // 8 colores base + tokens aditivos opcionales
  assets: ThemeAssets;      // logoUrl, faviconUrl, coBrandBankLogoUrl, coBrand
                            //   GroupLogoUrl?, ogImageUrl?
  legal: ThemeLegal;        // footerDisclaimer, termsUrl?, privacyUrl?
  typography: ThemeTypography; // fontFamily, fontUrlWoff2?
}
```

### `TenantResolution` (feature `001`, `src/app/core/tenant/tenant-resolution-model.ts`)

Provee el `partnerSlug` (`kind: 'partner'`) o el caso de fallback
(`kind: 'reserved' | 'root' | 'fallback'`). Esta feature **consume** el `slug`;
no lo resuelve.

---

## 2. Estado de UI nuevo (síncrono) — `ThemeStore`

**Ubicación**: `src/app/core/store/theme.store.ts` (transversal, sin feature
dueño — ARCHITECTURE §2). `providedIn: 'root'`.

### Estado

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `theme` | `PublicTheme \| null` | Theme **activo** aplicado a la UI. `null` solo en el instante previo a la primera resolución (en SSR nunca se pinta con `null`: siempre hay theme o default). |

### Computed

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `isBranded` | `boolean` | `theme() !== null && theme()!.slug !== '__default__'`. Distingue marca de partner vs default (para, p.ej., co-brand). |
| `cssVars` | `Record<string, string>` | `toCssVars(theme())` — mapa `--brand-*`→valor listo para escribir en `:root` (ver `contracts/css-variables.contract.md`). |

### Methods (mutaciones síncronas, `patchState`)

| Método | Firma | Efecto |
|--------|-------|--------|
| `apply` | `(theme: PublicTheme) => void` | Fija el theme activo. Invocado desde la hidratación (estado de `TransferState`) y desde `initialData`/`onSuccess` de la query. |
| `reset` | `() => void` | Vuelve al theme default (`getDefaultPublicTheme()` proyectado al cliente) — usado si una resolución posterior cae en fallback. **No** deja `null` en runtime. |

**Invariante**: el `ThemeStore` **no** contiene datos cacheables ni dispara HTTP
(Constitución I). Solo refleja el theme activo para el render. La caché es
responsabilidad de TanStack Query (§4).

**Reglas de transición de estado**:

```
(SSR)   resolver server-side → PublicTheme (partner | default) → TransferState
(cliente, bootstrap) TransferState → ThemeStore.apply(theme)   // primer estado, = SSR
(cliente, navegación) misma slug/version → sin cambio (cache hit, sin re-apply)
(cliente, cambio de partner) nueva slug → query initialData/onSuccess → apply(nuevo)
(fallback en cualquier resolución) → apply(defaultPublicTheme)  // = reset() semántico
```

---

## 3. Estructura derivada — `CssVarMap` (pura, sin estado)

**Ubicación**: `src/app/core/theme/theme-css-vars.ts`. Función pura
`toCssVars(theme: PublicTheme | null): Record<string, string>`.

| Entrada (`PublicTheme`) | Salida (`--brand-*`) |
|---|---|
| `tokens.colorPrimary` | `--brand-primary` |
| `tokens.colorPrimaryTint` | `--brand-primary-tint` |
| `tokens.colorSecondary` | `--brand-secondary` |
| `tokens.colorSecondaryTint` | `--brand-secondary-tint` |
| `tokens.colorTextStrong` | `--brand-text-strong` |
| `tokens.colorTextMuted` | `--brand-text-muted` |
| `tokens.colorSurface` | `--brand-surface` |
| `tokens.colorBorder` | `--brand-border` |
| `tokens[<extra>]` (aditivos, FR-006 de `002`) | `--brand-<kebab(extra)>` |
| `typography.fontFamily` | `--brand-font-family` |

`theme === null` ⇒ mapa vacío (el `@theme` de Tailwind provee neutros de
arranque; en SSR nunca se sirve `null`). Detalle normativo y ejemplos en
`contracts/css-variables.contract.md`.

---

## 4. Estado de servidor (caché) — query de theme

**Ubicación**: `src/app/features/theming/queries/theme-queries.ts`
(`@Injectable({ providedIn: 'root' })`). No es "modelo de datos" sino la
**clave y forma de caché**:

| Aspecto | Valor |
|---|---|
| `queryKey` | `['theme', slug, version]` — `version` de `PublicTheme` (D8) |
| `queryFn` | `ThemeApiService.getTheme(slug)` → `PublicTheme` (endpoint real: PRD 04) |
| `initialData` | `PublicTheme` leído de `TransferState` (evita fetch en hidratación) |
| `staleTime` | `5 * 60_000` (PRD §6) |
| `gcTime` | `30 * 60_000` (PRD §6) |

---

## 5. Transferencia SSR→cliente — `TransferState`

| Aspecto | Valor |
|---|---|
| Key | `THEME_STATE_KEY = makeStateKey<PublicTheme>('theme')` |
| Escritura | Resolver/inicializador **server-side** tras resolver el `PublicTheme` |
| Lectura | Inicializador **cliente**: siembra `ThemeStore.apply(...)` y el `initialData` de la query |
| Garantía | El valor transferido es **idéntico** al usado para pintar el SSR (FR-014) |

Contrato completo en `contracts/theme-transfer.contract.md`.

---

## 6. Metadatos de página (derivados del theme activo)

No es una entidad persistida: son efectos derivados que el `theme-applier`
escribe al DOM a partir del `ThemeStore`:

| Metadato | Fuente en `PublicTheme` | Destino DOM |
|---|---|---|
| Favicon | `assets.faviconUrl` | `<link rel="icon">` |
| Título de pestaña | `displayName` (+ paso del journey si aplica) | `document.title` / `Title` |
| Preload de fuente | `typography.fontUrlWoff2?` | `<link rel="preload" as="font">` |
| OG image (opcional) | `assets.ogImageUrl?` | `<meta property="og:image">` |

---

## 7. Relación entre modelos

```
TenantResolution (001) ──slug──►  resolver theme server-side
                                        │  getPublishedTheme(slug) | getDefaultPublicTheme()  (002, in-process, D3)
                                        ▼
                                  PublicTheme (002)
                                   │            │
                        TransferState (SSR)   initialData (query, cliente)
                                   │            │
                                   ▼            ▼
                              ThemeStore.apply(theme)  ──cssVars──►  effect (theme-applier)
                                                                       │
                                                    :root --brand-*  + favicon + title + font preload
                                                                       │
                                                    Tailwind @theme (bg-primary, font-brand, ...)  → paint con marca
```
