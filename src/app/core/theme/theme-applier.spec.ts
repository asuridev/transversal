import { DOCUMENT } from '@angular/common';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { PublicTheme } from '../../../shared/partner/public-theme-model';
import { ThemeStore } from '../store/theme.store';
import { ThemeApplier } from './theme-applier';

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

describe('ThemeApplier', () => {
  let fakeDocument: Document;
  let store: InstanceType<typeof ThemeStore>;
  let applier: ThemeApplier;

  beforeEach(() => {
    fakeDocument = document.implementation.createHTMLDocument('theme-applier-test');

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: DOCUMENT, useValue: fakeDocument }],
    });

    store = TestBed.inject(ThemeStore);
    applier = TestBed.inject(ThemeApplier);
  });

  it('writes --brand-* CSS vars, favicon and font preload for Banco Popular', () => {
    store.apply(makeTheme({ typography: { fontFamily: 'Poppins', fontUrlWoff2: 'https://cdn.example.com/popular/font.woff2' } }));
    TestBed.flushEffects();

    expect(fakeDocument.documentElement.style.getPropertyValue('--brand-primary')).toBe('#00A056');

    const favicon = fakeDocument.getElementById('app-theme-favicon') as HTMLLinkElement;
    expect(favicon.href).toBe('https://cdn.example.com/popular/favicon.ico');

    const preload = fakeDocument.getElementById('app-theme-font-preload') as HTMLLinkElement;
    expect(preload.rel).toBe('preload');
    expect(preload.href).toBe('https://cdn.example.com/popular/font.woff2');
  });

  it('does not create a font preload link when fontUrlWoff2 is absent', () => {
    store.apply(makeTheme());
    TestBed.flushEffects();

    expect(fakeDocument.getElementById('app-theme-font-preload')).toBeNull();
  });

  it('is idempotent: applying the same theme twice does not duplicate <link> elements', () => {
    const theme = makeTheme();
    store.apply(theme);
    TestBed.flushEffects();
    store.apply({ ...theme });
    TestBed.flushEffects();

    const favicons = fakeDocument.querySelectorAll('#app-theme-favicon');
    expect(favicons.length).toBe(1);
  });

  it('switching from Popular to Occidente updates favicon without residue', () => {
    store.apply(makeTheme());
    TestBed.flushEffects();

    store.apply(
      makeTheme({
        slug: 'occidente',
        displayName: 'Banco Occidente',
        assets: {
          logoUrl: 'https://cdn.example.com/occidente/logo.svg',
          faviconUrl: 'https://cdn.example.com/occidente/favicon.ico',
          coBrandBankLogoUrl: 'https://cdn.example.com/occidente/banco-occidente.svg',
          heroImageUrl: 'https://cdn.example.com/occidente/hero.svg',
        },
      }),
    );
    TestBed.flushEffects();

    const favicon = fakeDocument.getElementById('app-theme-favicon') as HTMLLinkElement;
    expect(favicon.href).toBe('https://cdn.example.com/occidente/favicon.ico');
  });

  it('an invalid faviconUrl does not throw and does not erase already-applied CSS vars', () => {
    store.apply(makeTheme({ assets: { logoUrl: '', faviconUrl: '', coBrandBankLogoUrl: '', heroImageUrl: '' } }));

    expect(() => TestBed.flushEffects()).not.toThrow();
    expect(fakeDocument.documentElement.style.getPropertyValue('--brand-primary')).toBe('#00A056');
  });
});
