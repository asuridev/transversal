import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ThemeStore } from '../../../../core/store/theme.store';
import { ThemePreview } from './theme-preview';
import type { ThemeDraft } from '../../models/partner-admin-model';

const DRAFT: ThemeDraft = {
  tokens: {
    colorPrimary: '#00ff00',
    colorPrimaryTint: '#e9f0d6',
    colorSecondary: '#93bd0e',
    colorSecondaryTint: '#d2e1ae',
    colorSurface: '#ffffff',
    colorBorder: '#dadada',
    colorTextStrong: '#333333',
    colorTextMuted: '#575451',
    colorHeroSurface: '#edeffa',
    colorHeroText: '#021d3f',
    colorFooterSurface: '#ffffff',
    colorFooterText: '#313a43',
  },
  assets: {
    logoUrl: 'https://cdn/logo.svg',
    faviconUrl: 'https://cdn/favicon.ico',
    coBrandBankLogoUrl: 'https://cdn/co-brand.svg',
    heroImageUrl: 'https://cdn/hero.svg',
  },
  legal: { footerDisclaimer: 'Disclaimer' },
  typography: { fontFamily: 'Poppins' },
};

describe('ThemePreview', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('reapplies the draft tokens onto its own host, not :root', () => {
    const before = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary');

    const fixture = TestBed.createComponent(ThemePreview);
    fixture.componentRef.setInput('draft', DRAFT);
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    expect(hostEl.style.getPropertyValue('--brand-primary')).toBe('#00ff00');

    const after = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary');
    expect(after).toBe(before);
  });

  it('writes the Tailwind --color-* aliases onto the host so utility classes (footer) resolve in-scope', () => {
    const fixture = TestBed.createComponent(ThemePreview);
    fixture.componentRef.setInput('draft', {
      ...DRAFT,
      tokens: { ...DRAFT.tokens, colorFooterSurface: '#123456', colorFooterText: '#abcdef' },
    });
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    // La utilidad `bg-footer-surface` del footer consume var(--color-footer-surface).
    expect(hostEl.style.getPropertyValue('--color-footer-surface')).toBe('#123456');
    expect(hostEl.style.getPropertyValue('--color-footer-text')).toBe('#abcdef');
    expect(hostEl.style.getPropertyValue('--color-primary')).toBe('#00ff00');
    // Y sigue escribiendo el --brand-* directo que usan los estilos inline del preview.
    expect(hostEl.style.getPropertyValue('--brand-footer-surface')).toBe('#123456');
  });

  it('reacts to a colorFooterSurface change (live preview updates the footer alias)', () => {
    const fixture = TestBed.createComponent(ThemePreview);
    fixture.componentRef.setInput('draft', DRAFT);
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    expect(hostEl.style.getPropertyValue('--color-footer-surface')).toBe('#ffffff');

    fixture.componentRef.setInput('draft', {
      ...DRAFT,
      tokens: { ...DRAFT.tokens, colorFooterSurface: '#000000' },
    });
    fixture.detectChanges();

    expect(hostEl.style.getPropertyValue('--color-footer-surface')).toBe('#000000');
  });

  it('renders the real brand-logo/brand-footer atoms with the draft as override', () => {
    const fixture = TestBed.createComponent(ThemePreview);
    fixture.componentRef.setInput('draft', DRAFT);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-brand-logo')).toBeTruthy();
    expect(el.querySelector('app-brand-footer')).toBeTruthy();
  });

  it('does not touch the global ThemeStore', () => {
    const fixture = TestBed.createComponent(ThemePreview);
    fixture.componentRef.setInput('draft', DRAFT);
    fixture.detectChanges();

    const themeStore = TestBed.inject(ThemeStore);
    expect(themeStore.theme()).toBeNull();
  });
});
