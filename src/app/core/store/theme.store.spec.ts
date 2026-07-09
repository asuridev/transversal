import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { PublicTheme } from '../../../shared/partner/public-theme-model';
import { ThemeStore } from './theme.store';

function makeTheme(overrides: Partial<PublicTheme> = {}): PublicTheme {
  return {
    slug: 'popular',
    displayName: 'Banco Popular',
    version: 1,
    tokens: {
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
    },
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

describe('ThemeStore', () => {
  let store: InstanceType<typeof ThemeStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ThemeStore);
  });

  it('starts with theme() null and isBranded false', () => {
    expect(store.theme()).toBeNull();
    expect(store.isBranded()).toBeFalse();
  });

  it('apply() sets the active theme and isBranded becomes true for a non-default slug', () => {
    store.apply(makeTheme());
    expect(store.theme()?.slug).toBe('popular');
    expect(store.isBranded()).toBeTrue();
  });

  it('isBranded is false when the applied theme is __default__', () => {
    store.apply(makeTheme({ slug: '__default__' }));
    expect(store.isBranded()).toBeFalse();
  });

  it('cssVars is derived from toCssVars(theme())', () => {
    store.apply(makeTheme());
    expect(store.cssVars()['--brand-primary']).toBe('#00A056');
  });

  it('reset() returns to the default theme, never leaving null at runtime', () => {
    store.apply(makeTheme());
    store.reset();
    expect(store.theme()).not.toBeNull();
    expect(store.isBranded()).toBeFalse();
  });
});
