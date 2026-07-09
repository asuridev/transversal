import type { ThemeTokens, ThemeAssets, ThemeLegal, ThemeTypography } from './partner-theme-model.ts';

/**
 * Proyección pública del theme publicado vigente. Excluye todo campo interno
 * sensible (`id`, `partnerId`, `createdBy`, `publishedAt`, `status`, ...) — FR-007.
 */
export interface PublicTheme {
  slug: string;
  displayName: string;
  version: number;
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
}
