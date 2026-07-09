// Reexporta el default client-safe (`src/shared/partner/default-public-theme.ts`) para que
// el resolver server-side y la persistencia sigan importando desde `server/theme/` sin duplicar
// la definición del theme neutro (única fuente de verdad, consumible también por el cliente).
export { DEFAULT_PARTNER_SLUG, getDefaultPublicTheme } from '../../shared/partner/default-public-theme.ts';
