import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { BrandFooter } from './brand-footer';
import type { PublicTheme } from '../../../../../shared/partner/public-theme-model';

function makeTheme(overrides: Partial<PublicTheme['assets']>, footerSurface = '#000000'): PublicTheme {
  return {
    slug: 'popular',
    displayName: 'Banco Popular',
    version: 1,
    tokens: {
      colorPrimary: '#00947F',
      colorPrimaryTint: '#E9F0D6',
      colorSecondary: '#8FB434',
      colorSecondaryTint: '#D2E1AE',
      colorTextStrong: '#000000',
      colorTextMuted: '#808080',
      colorSurface: '#FFFFFF',
      colorBorder: '#EBEBEB',
      colorHeroSurface: '#00947F',
      colorHeroText: '#FFFFFF',
      colorFooterSurface: footerSurface,
      colorFooterText: '#FFFFFF',
    },
    assets: {
      logoUrl: 'https://cdn/logo.svg',
      faviconUrl: 'https://cdn/favicon.ico',
      coBrandBankLogoUrl: 'https://cdn/bank.svg',
      heroImageUrl: 'https://cdn/hero.svg',
      ...overrides,
    },
    legal: { footerDisclaimer: 'Vigilado.' },
    typography: { fontFamily: 'Poppins' },
  };
}

function render(theme: PublicTheme) {
  const fixture = TestBed.createComponent(BrandFooter);
  fixture.componentRef.setInput('themeOverride', theme);
  fixture.detectChanges();
  return fixture;
}

function imgSrcs(fixture: ReturnType<typeof render>): string[] {
  return fixture.debugElement.queryAll(By.css('img')).map((el) => el.nativeElement.getAttribute('src'));
}

describe('BrandFooter', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('pinta el sello, el co-brand y la aseguradora desde el theme', () => {
    const fixture = render(
      makeTheme({
        footerSealUrl: 'https://cdn/seal.svg',
        coBrandBankLogoUrl: 'https://cdn/bank.svg',
        footerInsurerUrl: 'https://cdn/insurer.svg',
      }),
    );
    const srcs = imgSrcs(fixture);
    expect(srcs).toContain('https://cdn/seal.svg');
    expect(srcs).toContain('https://cdn/bank.svg');
    expect(srcs).toContain('https://cdn/insurer.svg');
  });

  it('en footer oscuro usa la variante clara cuando existe', () => {
    const fixture = render(
      makeTheme(
        {
          coBrandBankLogoUrl: 'https://cdn/bank.svg',
          coBrandBankLogoInverseUrl: 'https://cdn/bank-inverse.svg',
        },
        '#000000',
      ),
    );
    const srcs = imgSrcs(fixture);
    expect(srcs).toContain('https://cdn/bank-inverse.svg');
    expect(srcs).not.toContain('https://cdn/bank.svg');
  });

  it('en footer claro usa la base aunque exista variante clara (no ignora la subida base)', () => {
    const fixture = render(
      makeTheme(
        {
          coBrandBankLogoUrl: 'https://cdn/bank.svg',
          coBrandBankLogoInverseUrl: 'https://cdn/bank-inverse.svg',
        },
        '#ffffff',
      ),
    );
    const srcs = imgSrcs(fixture);
    expect(srcs).toContain('https://cdn/bank.svg');
    expect(srcs).not.toContain('https://cdn/bank-inverse.svg');
  });

  it('el sello usa la base aunque el footer sea oscuro (vive en la franja superior clara)', () => {
    const fixture = render(
      makeTheme(
        {
          footerSealUrl: 'https://cdn/seal.svg',
          footerSealInverseUrl: 'https://cdn/seal-inverse.svg',
          coBrandBankLogoUrl: 'https://cdn/bank.svg',
          coBrandBankLogoInverseUrl: 'https://cdn/bank-inverse.svg',
        },
        '#000000',
      ),
    );
    const srcs = imgSrcs(fixture);
    // Sello: base (franja superior clara), NO la inversa.
    expect(srcs).toContain('https://cdn/seal.svg');
    expect(srcs).not.toContain('https://cdn/seal-inverse.svg');
    // Co-brand sobre la banda oscura: sí usa la variante clara.
    expect(srcs).toContain('https://cdn/bank-inverse.svg');
  });

  it('no pinta imágenes ausentes (sin placeholder roto)', () => {
    const fixture = render(makeTheme({ coBrandBankLogoUrl: 'https://cdn/bank.svg' }));
    const srcs = imgSrcs(fixture);
    // Solo el co-brand banco; sin sello ni aseguradora ni grupo.
    expect(srcs).toEqual(['https://cdn/bank.svg']);
  });
});
