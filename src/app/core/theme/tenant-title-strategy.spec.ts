import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import type { RouterStateSnapshot } from '@angular/router';

import type { PublicTheme } from '../../../shared/partner/public-theme-model';
import { ThemeStore } from '../store/theme.store';
import { TenantTitleStrategy } from './tenant-title-strategy';

function makeTheme(displayName: string): PublicTheme {
  return {
    slug: 'popular',
    displayName,
    version: 1,
    tokens: {} as PublicTheme['tokens'],
    assets: {} as PublicTheme['assets'],
    legal: { footerDisclaimer: '' },
    typography: { fontFamily: 'Inter' },
  };
}

describe('TenantTitleStrategy', () => {
  let strategy: TenantTitleStrategy;
  let store: InstanceType<typeof ThemeStore>;
  let title: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), TenantTitleStrategy],
    });
    strategy = TestBed.inject(TenantTitleStrategy);
    store = TestBed.inject(ThemeStore);
    title = TestBed.inject(Title);
  });

  const snapshot = {} as RouterStateSnapshot;

  it('compone "{título de vista} — {displayName}" cuando la ruta tiene título', () => {
    spyOn(strategy, 'buildTitle').and.returnValue('Partners');
    store.apply(makeTheme('Banco Popular'));
    strategy.updateTitle(snapshot);
    TestBed.flushEffects();
    expect(title.getTitle()).toBe('Partners — Banco Popular');
  });

  it('usa solo el displayName cuando la ruta no tiene título (páginas públicas)', () => {
    spyOn(strategy, 'buildTitle').and.returnValue(undefined);
    store.apply(makeTheme('Banco Occidente'));
    strategy.updateTitle(snapshot);
    TestBed.flushEffects();
    expect(title.getTitle()).toBe('Banco Occidente');
  });

  it('recompone al cambiar el tenant (theme async) sin re-navegar', () => {
    spyOn(strategy, 'buildTitle').and.returnValue('Editar partner');
    store.apply(makeTheme('Banco Popular'));
    strategy.updateTitle(snapshot);
    TestBed.flushEffects();
    expect(title.getTitle()).toBe('Editar partner — Banco Popular');

    store.apply(makeTheme('Banco Occidente'));
    TestBed.flushEffects();
    expect(title.getTitle()).toBe('Editar partner — Banco Occidente');
  });
});
