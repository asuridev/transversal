# Contract — Proyección pública del theme (`PublicTheme`)

**Única fuente de verdad del shape** que consume el front (PRD 03/04) y el Back
Office para previsualizar (FR-008). Deriva de un `PartnerTheme` **publicado** +
su `Partner`. **Excluye** todo dato interno sensible (FR-007, SC-001).

Ubicación de tipo y función: `src/shared/partner/public-theme-model.ts` y
`src/shared/partner/theme-projection.ts` (función **pura**, testeable con
`node:test`).

## Shape

```typescript
interface PublicTheme {
  slug: string;          // de Partner.slug
  displayName: string;   // de Partner.displayName
  version: number;       // PartnerTheme.version de la versión publicada servida
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
}
```

## Campos EXCLUIDOS (nunca en la proyección)

`Partner.id`, `Partner.themeId`, `Partner.status`, `Partner.createdBy/updatedBy`,
`Partner.createdAt/updatedAt`, `PartnerTheme.id`, `PartnerTheme.partnerId`,
`PartnerTheme.createdBy`, `PartnerTheme.createdAt`, `PartnerTheme.publishedAt`, y
**cualquier** credencial o endpoint de integración. (FR-007, SC-001, US2 esc. 2.)

## Función de proyección (pura)

```typescript
// src/shared/partner/theme-projection.ts
export function toPublicTheme(theme: PartnerTheme, partner: Partner): PublicTheme {
  return {
    slug: partner.slug,
    displayName: partner.displayName,
    version: theme.version,
    tokens: theme.tokens,
    assets: theme.assets,
    legal: theme.legal,
    typography: theme.typography,
  };
}
```

**Propiedad de test** (contract): para cualquier `PartnerTheme`/`Partner`, el
conjunto de claves de `toPublicTheme(...)` es **exactamente**
`{slug, displayName, version, tokens, assets, legal, typography}` — ni una clave
interna se filtra. (SC-001 = "cero campos internos sensibles filtrados".)

## Ejemplo — `GET /api/theme/:slug` (transporte del BFF, PRD 04; aquí solo el shape)

```jsonc
// Banco Popular (marca verde) — 200
{
  "slug": "popular",
  "displayName": "Banco Popular",
  "version": 7,
  "tokens": {
    "colorPrimary": "#00A056",
    "colorPrimaryTint": "#E9F0D6",
    "colorSecondary": "#8FB434",
    "colorSecondaryTint": "#D2E1AE",
    "colorTextStrong": "#000000",
    "colorTextMuted": "#808080",
    "colorSurface": "#FFFFFF",
    "colorBorder": "#EBEBEB"
  },
  "assets": {
    "logoUrl": "https://cdn.../seguros-alfa/logo.svg",
    "faviconUrl": "https://cdn.../popular/favicon.ico",
    "coBrandBankLogoUrl": "https://cdn.../popular/banco-popular.svg",
    "coBrandGroupLogoUrl": "https://cdn.../grupo-aval.svg"
  },
  "legal": { "footerDisclaimer": "Vigilado por la Superintendencia Financiera de Colombia." },
  "typography": { "fontFamily": "Poppins" }
}
```

```jsonc
// Banco Occidente (marca azul) — MISMO shape, solo cambian valores (FR-009/SC-003)
{
  "slug": "occidente",
  "displayName": "Banco de Occidente",
  "version": 3,
  "tokens": {
    "colorPrimary": "#008ACC",
    "colorPrimaryTint": "#B6ECFF",
    "colorSecondary": "#002449",
    "colorSecondaryTint": "#CCD3DB",
    "colorTextStrong": "#262626",
    "colorTextMuted": "#808080",
    "colorSurface": "#FFFFFF",
    "colorBorder": "#CCCCCC"
  },
  "assets": {
    "logoUrl": "https://cdn.../seguros-alfa/logo.svg",
    "faviconUrl": "https://cdn.../occidente/favicon.ico",
    "coBrandBankLogoUrl": "https://cdn.../occidente/banco-occidente.svg"
  },
  "legal": { "footerDisclaimer": "Vigilado por la Superintendencia Financiera de Colombia." },
  "typography": { "fontFamily": "Poppins" }
}
```

## Fallback (theme por defecto)

Cuando la resolución cae en fallback (slug desconocido, partner inactivo, raíz), se
sirve el `PublicTheme` del partner `__default__` con **exactamente el mismo shape**,
**indistinguible** de otros fallbacks (SC-007, US5). No revela si un partner existe.
