import { PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { csrfInterceptor } from './csrf-interceptor';

describe('csrfInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    document.cookie = 'csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    document.cookie = 'csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  it('añade X-CSRF-Token en POST hacia /api/admin/*', () => {
    document.cookie = 'csrf=token-abc; path=/;';
    http.post('/api/admin/partners', {}).subscribe();
    const req = httpMock.expectOne('/api/admin/partners');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('token-abc');
    req.flush({});
  });

  it('añade X-CSRF-Token en PATCH/PUT/DELETE hacia /api/admin/*', () => {
    document.cookie = 'csrf=token-xyz; path=/;';

    http.patch('/api/admin/partners/1', {}).subscribe();
    expect(httpMock.expectOne('/api/admin/partners/1').request.headers.get('X-CSRF-Token')).toBe('token-xyz');

    http.put('/api/admin/partners/1', {}).subscribe();
    expect(httpMock.expectOne('/api/admin/partners/1').request.headers.get('X-CSRF-Token')).toBe('token-xyz');

    http.delete('/api/admin/partners/1').subscribe();
    expect(httpMock.expectOne('/api/admin/partners/1').request.headers.get('X-CSRF-Token')).toBe('token-xyz');

    httpMock.match(() => true).forEach((req) => req.flush({}));
  });

  it('GET no se modifica (sin header)', () => {
    document.cookie = 'csrf=token-abc; path=/;';
    http.get('/api/admin/partners').subscribe();
    const req = httpMock.expectOne('/api/admin/partners');
    expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
    req.flush({});
  });

  it('añade X-CSRF-Token en POST hacia /api/auth/* (logout)', () => {
    document.cookie = 'csrf=token-auth; path=/;';
    http.post('/api/auth/logout', {}).subscribe();
    const req = httpMock.expectOne('/api/auth/logout');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('token-auth');
    req.flush({ ok: true });
  });

  it('mutaciones fuera de /api/admin/* y /api/auth/* no se modifican', () => {
    document.cookie = 'csrf=token-abc; path=/;';
    http.post('/api/other/thing', {}).subscribe();
    const req = httpMock.expectOne('/api/other/thing');
    expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
    req.flush({});
  });
});

describe('csrfInterceptor (SSR / plataforma servidor)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    document.cookie = 'csrf=token-abc; path=/;';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: 'server' },
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    document.cookie = 'csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  it('en el servidor no añade header ni toca `document` (SSR-safe)', () => {
    http.post('/api/admin/partners', {}).subscribe();
    const req = httpMock.expectOne('/api/admin/partners');
    expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
    req.flush({});
  });
});
