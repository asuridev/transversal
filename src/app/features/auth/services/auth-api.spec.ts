import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { AuthApiService } from './auth-api';

describe('AuthApiService', () => {
  let service: AuthApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getSession: GET /admin/session', () => {
    let result: unknown;
    service.getSession().subscribe((r) => (result = r));
    const req = httpMock.expectOne(`${environment.apiUrl}/admin/session`);
    expect(req.request.method).toBe('GET');
    req.flush({ subject: 'u-1', name: 'Ana', roles: ['partner-editor'] });

    expect(result).toEqual({ subject: 'u-1', name: 'Ana', roles: ['partner-editor'] });
  });

  it('logout: POST /auth/logout y devuelve endSessionUrl', () => {
    let result: unknown;
    service.logout().subscribe((r) => (result = r));
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true, endSessionUrl: 'http://idp/logout' });

    expect(result).toEqual({ ok: true, endSessionUrl: 'http://idp/logout' });
  });
});
