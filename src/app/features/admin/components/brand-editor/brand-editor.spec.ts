import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { BrandEditor } from './brand-editor';
import { AssetUploader } from '../asset-uploader/asset-uploader';
import type { ThemeDraft } from '../../models/partner-admin-model';

const INITIAL_THEME: ThemeDraft = {
  tokens: {
    colorPrimary: '#00965e',
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
  legal: {
    footerDisclaimer: 'Disclaimer',
  },
  typography: {
    fontFamily: 'Poppins',
  },
};

describe('BrandEditor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(BrandEditor);
    fixture.componentRef.setInput('initialTheme', INITIAL_THEME);
    fixture.componentRef.setInput('partnerId', '065ca891-5fbc-4c90-b526-286745bd3c5d');
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  it('builds a typed reactive FormGroup (no ngModel) seeded from the initial theme', () => {
    const { component } = create();
    expect(component.form.controls.tokens.controls.colorPrimary.value).toBe('#00965e');
  });

  it('derives isDirty from form changes', () => {
    const { component } = create();
    expect(component.isDirty()).toBe(false);
    component.form.controls.tokens.controls.colorPrimary.setValue('#123456');
    expect(component.isDirty()).toBe(true);
  });

  it('reports contrast warnings without invalidating the form', () => {
    const { component } = create();
    component.form.controls.tokens.controls.colorTextMuted.setValue('#f0f0f0');
    expect(component.contrastWarnings().length).toBeGreaterThan(0);
    expect(component.form.valid).toBe(true);
  });

  it('exposes the current ThemeDraft via `draft` for the parent to read (Guardar/Publicar viven en `partner-edit`)', () => {
    const { component } = create();
    component.form.controls.tokens.controls.colorPrimary.setValue('#123456');
    expect(component.draft().tokens.colorPrimary).toBe('#123456');
  });

  it('incluye los slots del footer (sello Vigilado / aseguradora) en el draft cuando se llenan', () => {
    const { component } = create();
    component.form.controls.assets.controls.footerSealUrl.setValue('/assets/seal.svg');
    component.form.controls.assets.controls.footerInsurerUrl.setValue('/assets/insurer.svg');
    expect(component.draft().assets.footerSealUrl).toBe('/assets/seal.svg');
    expect(component.draft().assets.footerInsurerUrl).toBe('/assets/insurer.svg');
  });

  it('omite los slots del footer vacíos en el draft', () => {
    const { component } = create();
    expect('footerSealUrl' in component.draft().assets).toBe(false);
    expect('footerInsurerUrl' in component.draft().assets).toBe(false);
  });

  it('integración: una subida en el AssetUploader (logoUrl) se refleja en draft().assets.logoUrl', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const { fixture, component } = create();

    // El primer AssetUploader del template está enlazado a `logoUrl` (ver brand-editor.html).
    const uploader = fixture.debugElement.query(By.directive(AssetUploader))
      .componentInstance as unknown as { onFileSelected: (e: Event) => Promise<void> };

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', { type: 'image/png' });
    const pending = uploader.onFileSelected({ target: { files: [file], value: '' } } as unknown as Event);

    await new Promise((r) => setTimeout(r, 100));
    httpMock.expectOne('/api/admin/assets').flush({ url: '/assets/x.png', key: 'x.png' });
    await pending;
    fixture.detectChanges();

    expect(component.draft().assets.logoUrl).toMatch(/^\/assets\/x\.png\?v=\d+$/);
    httpMock.verify();
  });
});
