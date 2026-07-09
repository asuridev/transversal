import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { unauthorizedRedirectInterceptor } from './unauthorized-redirect-interceptor';
import { BrowserRedirect } from './browser-redirect';
import { environment } from '../../../environments/environment';

describe('unauthorizedRedirectInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let redirected: string[];

  beforeEach(() => {
    redirected = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([unauthorizedRedirectInterceptor])),
        provideHttpClientTesting(),
        { provide: BrowserRedirect, useValue: { redirectTo: (url: string) => redirected.push(url) } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('401 en /api/admin/* ⇒ navega a webview-login, no a /api/auth/login directo (CT-13)', (done) => {
    http.get('/api/admin/partners').subscribe({
      error: () => {
        expect(redirected).toEqual([environment.webviewLoginUrl]);
        done();
      },
    });
    httpMock.expectOne('/api/admin/partners').flush(null, { status: 401, statusText: 'Unauthorized' });
  });

  it('401 en /api/admin/session (sondeo de sesión) no redirige — evita el bucle', (done) => {
    http.get('/api/admin/session').subscribe({
      error: () => {
        expect(redirected.length).toBe(0);
        done();
      },
    });
    httpMock.expectOne('/api/admin/session').flush(null, { status: 401, statusText: 'Unauthorized' });
  });

  it('401 fuera de /api/admin/* no redirige', (done) => {
    http.get('/api/theme/x').subscribe({
      error: () => {
        expect(redirected.length).toBe(0);
        done();
      },
    });
    httpMock.expectOne('/api/theme/x').flush(null, { status: 401, statusText: 'Unauthorized' });
  });

  it('errores distintos de 401 no redirigen', (done) => {
    http.get('/api/admin/partners').subscribe({
      error: () => {
        expect(redirected.length).toBe(0);
        done();
      },
    });
    httpMock.expectOne('/api/admin/partners').flush(null, { status: 500, statusText: 'Server Error' });
  });
});
