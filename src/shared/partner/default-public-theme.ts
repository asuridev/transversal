import type { PublicTheme } from './public-theme-model.ts';

/**
 * Slug reservado del partner sintético de fallback (FR-018/019). No es un
 * partner administrable estándar: no aparece en `listPartners` (FR-019) y no
 * se persiste en `partners` — vive en código.
 */
export const DEFAULT_PARTNER_SLUG = '__default__';

/** PublicTheme neutro servido en fallback (SC-007) — mismo shape, sin datos de un banco real. */
const DEFAULT_PUBLIC_THEME: PublicTheme = {
  slug: DEFAULT_PARTNER_SLUG,
  displayName: 'Plataforma',
  version: 1,
  tokens: {
    colorPrimary: '#1F2937',
    colorPrimaryTint: '#E5E7EB',
    colorSecondary: '#4B5563',
    colorSecondaryTint: '#F3F4F6',
    colorTextStrong: '#111827',
    colorTextMuted: '#6B7280',
    colorSurface: '#FFFFFF',
    colorBorder: '#D1D5DB',
    colorHeroSurface: '#F3F4F6',
    colorHeroText: '#111827',
    colorFooterSurface: '#FFFFFF',
    colorFooterText: '#6B7280',
  },
  assets: {
    logoUrl: 'https://cdn.example.com/__default__/logo.svg',
    faviconUrl: 'https://cdn.example.com/__default__/favicon.ico',
    coBrandBankLogoUrl: 'https://cdn.example.com/__default__/co-brand.svg',
    heroImageUrl: 'https://cdn.example.com/__default__/hero.svg',
  },
  legal: {
    footerDisclaimer: 'Vigilado por la Superintendencia Financiera de Colombia.',
  },
  typography: {
    fontFamily: 'Poppins',
  },
};

/** Nueva copia en cada llamada: evita que un consumidor mute el singleton compartido. */
export function getDefaultPublicTheme(): PublicTheme {
  return structuredClone(DEFAULT_PUBLIC_THEME);
}
