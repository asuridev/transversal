import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { AdminApiService } from './admin-api';

describe('AdminApiService', () => {
  let service: AdminApiService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/admin`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listPartners: GET /admin/partners without status filter', () => {
    service.listPartners().subscribe();
    const req = httpMock.expectOne(`${base}/partners`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listPartners: GET /admin/partners?status=active with filter', () => {
    service.listPartners({ query: '', status: 'active' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${base}/partners` && r.params.get('status') === 'active');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getPartner: GET /admin/partners/:id', () => {
    service.getPartner('p1').subscribe();
    const req = httpMock.expectOne(`${base}/partners/p1`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'p1', slug: 's', displayName: 'D', status: 'active', publishedTheme: null, draftTheme: null });
  });

  it('createPartner: POST /admin/partners with body', () => {
    const body = { slug: 'popular', partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae', displayName: 'Banco Popular' };
    service.createPartner(body).subscribe();
    const req = httpMock.expectOne(`${base}/partners`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ partner: {}, theme: {} });
  });

  it('saveThemeVersion: PATCH /admin/partners/:id with body', () => {
    const body = {
      tokens: {} as never,
      assets: {} as never,
      legal: {} as never,
      typography: {} as never,
    };
    service.saveThemeVersion('p1', body).subscribe();
    const req = httpMock.expectOne(`${base}/partners/p1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('publish: POST /admin/partners/:id/publish with themeId', () => {
    service.publish('p1', 't2').subscribe();
    const req = httpMock.expectOne(`${base}/partners/p1/publish`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ themeId: 't2' });
    req.flush({ ok: true });
  });

  it('deactivate: POST /admin/partners/:id/deactivate', () => {
    service.deactivate('p1').subscribe();
    const req = httpMock.expectOne(`${base}/partners/p1/deactivate`);
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true });
  });

  it('activate: POST /admin/partners/:id/activate', () => {
    service.activate('p1').subscribe();
    const req = httpMock.expectOne(`${base}/partners/p1/activate`);
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true });
  });

  it('uploadAsset: POST /admin/assets with body, returns { url, key } without secrets', () => {
    const body = {
      partnerId: '065ca891-5fbc-4c90-b526-286745bd3c5d',
      slot: 'logo' as const,
      mimeType: 'image/png',
      base64: 'AAA=',
    };
    let result: { url: string; key: string } | undefined;
    service.uploadAsset(body).subscribe((r) => (result = r));
    const req = httpMock.expectOne(`${base}/assets`);
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'https://cdn/x.png', key: 'x.png' });

    expect(result).toEqual({ url: 'https://cdn/x.png', key: 'x.png' });
    expect(JSON.stringify(result)).not.toMatch(/apiKey|baseUrl/);
  });

  it('never deserializes apiKey/baseUrl on listPartners response', () => {
    let result: unknown;
    service.listPartners().subscribe((r) => (result = r));
    const req = httpMock.expectOne(`${base}/partners`);
    req.flush([
      { slug: 'popular', displayName: 'Banco Popular', status: 'active', credentialConfigured: true, currentVersion: 1, updatedAt: 'now', updatedBy: 'x' },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/apiKey|baseUrl/);
  });
});
