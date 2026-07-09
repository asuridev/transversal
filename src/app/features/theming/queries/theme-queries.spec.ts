import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import type { PublicTheme } from '../../../../shared/partner/public-theme-model';
import { ThemeQueries } from './theme-queries';

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

describe('ThemeQueries', () => {
  let queries: ThemeQueries;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideZonelessChangeDetection(), provideTanStackQuery(new QueryClient())],
    });
    queries = TestBed.inject(ThemeQueries);
  });

  it('queryKey changes when version changes (cache-busting, FR-013)', () => {
    const v1 = queries.bySlug('popular', 1, makeTheme({ version: 1 }));
    const v2 = queries.bySlug('popular', 2, makeTheme({ version: 2 }));

    expect(v1.queryKey).toEqual(['theme', 'popular', 1]);
    expect(v2.queryKey).toEqual(['theme', 'popular', 2]);
    expect(v1.queryKey).not.toEqual(v2.queryKey);
  });

  it('seeds initialData from the theme passed in (no fetch needed on first render)', () => {
    const theme = makeTheme({ version: 3 });
    const options = queries.bySlug('popular', 3, theme);

    expect(options.initialData).toEqual(theme);
  });

  it('the old version queryKey stays distinct — a new version is a new cache entry', () => {
    const oldVersion = queries.bySlug('popular', 1, makeTheme({ version: 1 }));
    const newVersion = queries.bySlug('popular', 2, makeTheme({ version: 2 }));

    const oldKeyJson = JSON.stringify(oldVersion.queryKey);
    const newKeyJson = JSON.stringify(newVersion.queryKey);

    expect(oldKeyJson).not.toBe(newKeyJson);
  });
});
