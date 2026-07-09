import type { Partner } from './partner-model.ts';
import type { PartnerTheme } from './partner-theme-model.ts';
import type { PublicTheme } from './public-theme-model.ts';

/** Proyección pura del theme publicado + su partner al contrato público (FR-007). */
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
