import type { PublicTheme } from '../../../shared/partner/public-theme-model';

const TOKEN_KEY_MAP: Record<string, string> = {
  colorPrimary: '--brand-primary',
  colorPrimaryTint: '--brand-primary-tint',
  colorSecondary: '--brand-secondary',
  colorSecondaryTint: '--brand-secondary-tint',
  colorTextStrong: '--brand-text-strong',
  colorTextMuted: '--brand-text-muted',
  colorSurface: '--brand-surface',
  colorBorder: '--brand-border',
  colorHeroSurface: '--brand-hero-surface',
  colorHeroText: '--brand-hero-text',
  colorFooterSurface: '--brand-footer-surface',
  colorFooterText: '--brand-footer-text',
};

function toKebabCase(camelCase: string): string {
  return camelCase.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Proyecta un `PublicTheme` a un mapa `--brand-*` listo para escribir en `:root` (contract css-variables). */
export function toCssVars(theme: PublicTheme | null): Record<string, string> {
  if (theme === null) {
    return {};
  }

  const cssVars: Record<string, string> = {};

  for (const [tokenKey, value] of Object.entries(theme.tokens)) {
    if (value === undefined) {
      continue;
    }
    const cssVarName = TOKEN_KEY_MAP[tokenKey] ?? `--brand-${toKebabCase(tokenKey)}`;
    cssVars[cssVarName] = value;
  }

  cssVars['--brand-font-family'] = theme.typography.fontFamily;

  return cssVars;
}

/**
 * Igual que `toCssVars`, pero además refleja cada `--brand-*` en su variable de
 * Tailwind `--color-*` (y `--font-brand`). Necesario para aplicar el theme en un
 * host **scoped** (no `:root`): las utilidades `bg-footer-surface`/`text-*` de
 * Tailwind consumen `var(--color-*)`, cuya indirección `--color-*: var(--brand-*)`
 * del bloque `@theme` solo se declara en `:root`. Si únicamente escribimos
 * `--brand-*` en un descendiente, esa indirección ya quedó resuelta en `:root`
 * contra el default y no re-evalúa. Escribiendo también `--color-*` en el host,
 * las utilidades resuelven contra el theme scoped (preview en vivo del Back Office).
 * Solo refleja tokens de marca; nunca toca `--color-admin-*`.
 */
export function toScopedCssVars(theme: PublicTheme | null): Record<string, string> {
  const brandVars = toCssVars(theme);
  const scoped: Record<string, string> = { ...brandVars };
  for (const [name, value] of Object.entries(brandVars)) {
    if (name === '--brand-font-family') {
      scoped['--font-brand'] = `${value}, system-ui, sans-serif`;
    } else {
      scoped[name.replace('--brand-', '--color-')] = value;
    }
  }
  return scoped;
}
