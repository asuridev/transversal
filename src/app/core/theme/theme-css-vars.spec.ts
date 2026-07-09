import type { PublicTheme } from '../../../shared/partner/public-theme-model';
import type { ThemeTokens } from '../../../shared/partner/partner-theme-model';
import { toCssVars, toScopedCssVars } from './theme-css-vars';

const popularTokens: ThemeTokens = {
  colorPrimary: '#00A056',
  colorPrimaryTint: '#E9F0D6',
  colorSecondary: '#8FB434',
  colorSecondaryTint: '#D2E1AE',
  colorTextStrong: '#000000',
  colorTextMuted: '#808080',
  colorSurface: '#FFFFFF',
  colorBorder: '#EBEBEB',
  colorHeroSurface: '#00947F',
  colorHeroText: '#FFFFFF',
  colorFooterSurface: '#000000',
  colorFooterText: '#FFFFFF',
};

const occidenteTokens: ThemeTokens = {
  colorPrimary: '#008ACC',
  colorPrimaryTint: '#B6ECFF',
  colorSecondary: '#002449',
  colorSecondaryTint: '#CCD3DB',
  colorTextStrong: '#262626',
  colorTextMuted: '#808080',
  colorSurface: '#FFFFFF',
  colorBorder: '#CCCCCC',
  colorHeroSurface: '#EDEFFA',
  colorHeroText: '#021D3F',
  colorFooterSurface: '#FFFFFF',
  colorFooterText: '#313A43',
};

function makeTheme(overrides: Partial<PublicTheme> = {}): PublicTheme {
  return {
    slug: 'popular',
    displayName: 'Banco Popular',
    version: 1,
    tokens: { ...popularTokens },
    assets: {
      logoUrl: 'https://cdn.example.com/popular/logo.svg',
      faviconUrl: 'https://cdn.example.com/popular/favicon.ico',
      coBrandBankLogoUrl: 'https://cdn.example.com/popular/banco-popular.svg',
      heroImageUrl: 'https://cdn.example.com/popular/hero.jpg',
    },
    legal: {
      footerDisclaimer: 'Vigilado por la Superintendencia Financiera de Colombia.',
    },
    typography: {
      fontFamily: 'Poppins',
    },
    ...overrides,
  };
}

describe('toCssVars', () => {
  it('returns an empty map for null', () => {
    expect(toCssVars(null)).toEqual({});
  });

  it('produces the 13 normative --brand-* keys for a theme', () => {
    const result = toCssVars(makeTheme());

    expect(Object.keys(result).sort()).toEqual(
      [
        '--brand-primary',
        '--brand-primary-tint',
        '--brand-secondary',
        '--brand-secondary-tint',
        '--brand-text-strong',
        '--brand-text-muted',
        '--brand-surface',
        '--brand-border',
        '--brand-hero-surface',
        '--brand-hero-text',
        '--brand-footer-surface',
        '--brand-footer-text',
        '--brand-font-family',
      ].sort(),
    );
  });

  it('every key starts with --brand-', () => {
    const result = toCssVars(makeTheme());
    for (const key of Object.keys(result)) {
      expect(key.startsWith('--brand-')).toBeTrue();
    }
  });

  it('passes color values verbatim without transforming them', () => {
    const result = toCssVars(makeTheme());
    expect(result['--brand-primary']).toBe('#00A056');
    expect(result['--brand-font-family']).toBe('Poppins');
  });

  it('produces the same keys with different values for Popular vs Occidente', () => {
    const popular = toCssVars(makeTheme({ tokens: { ...popularTokens } }));
    const occidente = toCssVars(makeTheme({ tokens: { ...occidenteTokens } }));

    expect(Object.keys(popular).sort()).toEqual(Object.keys(occidente).sort());
    expect(popular['--brand-primary']).not.toBe(occidente['--brand-primary']);
    expect(popular['--brand-hero-surface']).not.toBe(occidente['--brand-hero-surface']);
  });

  it('emits an additive token as kebab-case --brand-*', () => {
    const theme = makeTheme({
      tokens: { ...popularTokens, accentHover: '#123456' },
    });

    const result = toCssVars(theme);
    expect(result['--brand-accent-hover']).toBe('#123456');
  });
});

describe('toScopedCssVars', () => {
  it('returns an empty map for null', () => {
    expect(toScopedCssVars(null)).toEqual({});
  });

  it('keeps every --brand-* from toCssVars', () => {
    const brand = toCssVars(makeTheme());
    const scoped = toScopedCssVars(makeTheme());
    for (const [key, value] of Object.entries(brand)) {
      expect(scoped[key]).toBe(value);
    }
  });

  it('mirrors each brand color into its Tailwind --color-* alias with the same value', () => {
    const scoped = toScopedCssVars(makeTheme());
    expect(scoped['--color-footer-surface']).toBe('#000000');
    expect(scoped['--color-footer-text']).toBe('#FFFFFF');
    expect(scoped['--color-primary']).toBe('#00A056');
    expect(scoped['--color-hero-surface']).toBe('#00947F');
  });

  it('mirrors the font family into --font-brand with a fallback stack', () => {
    const scoped = toScopedCssVars(makeTheme());
    expect(scoped['--font-brand']).toBe('Poppins, system-ui, sans-serif');
  });

  it('never emits an --color-admin-* (does not touch the Back Office chrome)', () => {
    const scoped = toScopedCssVars(makeTheme());
    for (const key of Object.keys(scoped)) {
      expect(key.startsWith('--color-admin-')).toBeFalse();
    }
  });
});
