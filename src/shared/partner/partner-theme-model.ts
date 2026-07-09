export interface ThemeTokens {
  colorPrimary: string;
  colorPrimaryTint: string;
  colorSecondary: string;
  colorSecondaryTint: string;
  colorTextStrong: string;
  colorTextMuted: string;
  colorSurface: string;
  colorBorder: string;
  // Superficies de página cuyo contraste difiere del `colorSurface` general:
  // el panel héroe y el footer pueden invertirse por partner (Occidente claro /
  // Popular oscuro), por eso llevan su propio color de fondo y de texto.
  colorHeroSurface: string;
  colorHeroText: string;
  colorFooterSurface: string;
  colorFooterText: string;
  // paleta mínima; se amplía con campos opcionales sin romper consumidores (FR-006)
  [extraToken: string]: string | undefined;
}

export interface ThemeAssets {
  logoUrl: string;
  faviconUrl: string;
  coBrandBankLogoUrl: string;
  coBrandGroupLogoUrl?: string;
  ogImageUrl?: string;
  // Imagen del panel héroe de la página "Conoce a tu cliente" (ilustración o foto).
  heroImageUrl: string;
  // Sellos del programa que van en el footer, editables por partner. El sello
  // Vigilado (Superintendencia Financiera) y la aseguradora del programa
  // (p. ej. Seguros Alfa). Si faltan, el footer simplemente no los pinta.
  footerSealUrl?: string;
  footerInsurerUrl?: string;
  // Variantes invertidas para superficies oscuras (footer del tipo Popular):
  // si faltan, el consumidor cae a la variante base.
  logoInverseUrl?: string;
  coBrandBankLogoInverseUrl?: string;
  coBrandGroupLogoInverseUrl?: string;
  footerSealInverseUrl?: string;
  footerInsurerInverseUrl?: string;
}

export interface ThemeLegal {
  footerDisclaimer: string;
  termsUrl?: string;
  privacyUrl?: string;
}

export interface ThemeTypography {
  fontFamily: string;
  fontUrlWoff2?: string;
}

export interface PartnerTheme {
  id: string;
  partnerId: string;
  version: number;
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface NewThemeVersion {
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
  createdBy: string;
}
