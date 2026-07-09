import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { AuthQueries } from './auth-queries';

describe('AuthQueries', () => {
  let queries: AuthQueries;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    queries = TestBed.inject(AuthQueries);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('session(): queryKey estable y queryFn delega en AuthApiService.getSession()', async () => {
    const options = queries.session();
    expect(options.queryKey).toEqual(['auth', 'session']);

    const promise = options.queryFn!({} as never);
    const req = httpMock.expectOne(`${environment.apiUrl}/admin/session`);
    req.flush({ subject: 'u-1', name: 'Ana', roles: ['auditor'] });

    const result = await promise;
    expect(result).toEqual({ subject: 'u-1', name: 'Ana', roles: ['auditor'] });
  });

  it('logout(): mutationKey estable y mutationFn delega en AuthApiService.logout()', async () => {
    const options = queries.logout();
    expect(options.mutationKey).toEqual(['auth', 'logout']);

    const promise = (options.mutationFn as () => Promise<unknown>)();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true, endSessionUrl: 'http://idp/logout' });

    const result = await promise;
    expect(result).toEqual({ ok: true, endSessionUrl: 'http://idp/logout' });
  });
});
