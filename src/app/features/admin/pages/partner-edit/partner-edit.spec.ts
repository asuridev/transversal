import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../../environments/environment';
import { PartnerEdit } from './partner-edit';
import { NotificationService } from '../../../../core/notifications/notification-service';
import type { PartnerDetail } from '../../models/partner-admin-model';
import type { PartnerTheme } from '../../../../../shared/partner/partner-theme-model';

function makeTheme(overrides: Partial<PartnerTheme> = {}): PartnerTheme {
  return {
    id: 't1',
    partnerId: 'p1',
    version: 2,
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
    legal: { footerDisclaimer: 'Disclaimer' },
    typography: { fontFamily: 'Poppins' },
    publishedAt: null,
    createdBy: 'admin-1',
    createdAt: 'now',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PartnerDetail> = {}): PartnerDetail {
  return {
    id: 'p1',
    slug: 'popular',
    displayName: 'Banco Popular',
    status: 'active',
    publishedTheme: makeTheme({ publishedAt: 'yesterday' }),
    draftTheme: makeTheme({ id: 't-draft', version: 3 }),
    ...overrides,
  };
}

describe('PartnerEdit', () => {
  let httpMock: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => httpMock.verify());

  const detailUrl = `${environment.apiUrl}/admin/partners/p1`;

  async function createAndLoad(detail: PartnerDetail = makeDetail()): Promise<{
    fixture: ComponentFixture<PartnerEdit>;
    component: any;
  }> {
    const fixture = TestBed.createComponent(PartnerEdit);
    fixture.componentRef.setInput('id', 'p1');
    fixture.detectChanges();
    httpMock.expectOne(detailUrl).flush(detail);
    // Zoneless: se drenan varios macrotasks para que TanStack resuelva y el
    // template monte el brand-editor (viewChild).
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    }
    return { fixture, component: fixture.componentInstance as any };
  }

  it('carga el detalle del partner por el input `id` (route binding)', async () => {
    const { component } = await createAndLoad();
    expect(component.partnerQuery.data()?.slug).toBe('popular');
  });

  it('canPublish es true cuando hay draftTheme', async () => {
    const { component } = await createAndLoad();
    expect(component.canPublish()).toBe(true);
  });

  it('canPublish es false sin draftTheme', async () => {
    const { component } = await createAndLoad(makeDetail({ draftTheme: null }));
    expect(component.canPublish()).toBe(false);
  });

  it('hasUnsavedChanges es false al cargar (editor montado, sin ediciones)', async () => {
    const { component } = await createAndLoad();
    expect(component.hasUnsavedChanges()).toBe(false);
  });

  it('onSaveClick envía PATCH con el draft y notifica éxito', async () => {
    const { component } = await createAndLoad();
    component.onSaveClick();
    // La mutación despacha la petición en un microtask; se espera antes de asertar.
    await new Promise((r) => setTimeout(r, 0));

    const req = httpMock.expectOne(detailUrl);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.tokens.colorPrimary).toBe('#00965e');
    req.flush(makeTheme());
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(notifications.toasts().some((t) => t.kind === 'success')).toBe(true);
    // El `onSuccess` central invalida la query → el detalle se re-pide; se drena.
    httpMock.match(detailUrl).forEach((r) => r.flush(makeDetail()));
  });

  it('onPublish envía POST /publish con el id del draftTheme', async () => {
    const { component } = await createAndLoad();
    component.onPublish();
    await new Promise((r) => setTimeout(r, 0));

    const req = httpMock.expectOne(`${environment.apiUrl}/admin/partners/p1/publish`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.themeId).toBe('t-draft');
    req.flush({ ok: true });
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(notifications.toasts().some((t) => t.kind === 'success')).toBe(true);
    // Publicar invalida detalle y listado → se drenan los refetch del detalle.
    httpMock.match(detailUrl).forEach((r) => r.flush(makeDetail()));
  });

  it('onPublish sin draftTheme no llama al BFF y notifica error', async () => {
    const { component } = await createAndLoad(makeDetail({ draftTheme: null }));
    component.onPublish();
    httpMock.expectNone(`${environment.apiUrl}/admin/partners/p1/publish`);
    expect(notifications.toasts().some((t) => t.kind === 'error')).toBe(true);
  });
});
