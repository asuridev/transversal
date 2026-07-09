/**
 * Slots de asset de marca (campos subibles de `ThemeAssets`) → slug estable de
 * archivo. El key en disco se compone server-side como `<partnerId>-<slot>.<ext>`,
 * de modo que re-subir un slot **sobrescribe el mismo archivo** (nombre estable
 * por partner, sin acumular huérfanos). Fuente única compartida cliente↔servidor:
 * el cliente envía el slug en la subida, el servidor lo valida contra este mapa.
 */
export const ASSET_SLOT_SLUGS = {
  logoUrl: 'logo',
  faviconUrl: 'favicon',
  coBrandBankLogoUrl: 'cobrand-bank',
  coBrandGroupLogoUrl: 'cobrand-group',
  heroImageUrl: 'hero',
  footerSealUrl: 'footer-seal',
  footerInsurerUrl: 'footer-insurer',
  logoInverseUrl: 'logo-inverse',
  coBrandBankLogoInverseUrl: 'cobrand-bank-inverse',
  coBrandGroupLogoInverseUrl: 'cobrand-group-inverse',
  footerSealInverseUrl: 'footer-seal-inverse',
  footerInsurerInverseUrl: 'footer-insurer-inverse',
} as const;

/** Nombre del control de formulario (`ThemeAssets` key) que tiene un uploader. */
export type AssetSlotField = keyof typeof ASSET_SLOT_SLUGS;

/** Slug estable usado en el nombre de archivo (`<partnerId>-<slug>.<ext>`). */
export type AssetSlotSlug = (typeof ASSET_SLOT_SLUGS)[AssetSlotField];

const SLUGS: ReadonlySet<string> = new Set(Object.values(ASSET_SLOT_SLUGS));

/** True si `value` es uno de los slugs de slot permitidos (validación server-side). */
export function isAssetSlotSlug(value: unknown): value is AssetSlotSlug {
  return typeof value === 'string' && SLUGS.has(value);
}
