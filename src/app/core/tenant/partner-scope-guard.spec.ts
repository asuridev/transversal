import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { TenantStore } from '../store/tenant.store';
import { partnerScopeMatch } from './partner-scope-guard';

describe('partnerScopeMatch', () => {
  let parseUrl: jasmine.Spy;

  beforeEach(() => {
    parseUrl = jasmine.createSpy('parseUrl');
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Router, useValue: { parseUrl } }],
    });
  });

  it('true cuando no hay sesión (anónimo) — delega la redirección en authGuard', () => {
    const result = TestBed.runInInjectionContext(() => partnerScopeMatch({} as never, []));
    expect(result).toBeTrue();
    expect(parseUrl).not.toHaveBeenCalled();
  });

  it('redirige a /admin cuando el usuario autenticado no es asesor (admin)', () => {
    const authStore = TestBed.inject(AuthStore);
    authStore.setUser({ subject: 'u-adm', name: 'Admin', roles: ['platform-admin'] });
    const urlTree = {} as UrlTree;
    parseUrl.and.returnValue(urlTree);

    const result = TestBed.runInInjectionContext(() => partnerScopeMatch({} as never, []));
    expect(parseUrl).toHaveBeenCalledWith('/admin');
    expect(result).toBe(urlTree);
  });

  it('true cuando el partner de la sesión coincide con el tenant resuelto', () => {
    const authStore = TestBed.inject(AuthStore);
    const tenantStore = TestBed.inject(TenantStore);
    authStore.setUser({ subject: 'u-a', name: 'Asesor A', roles: [], partnerId: 'p-a', partnerSlug: 'banco-a' });
    tenantStore.setResolution({ kind: 'partner', slug: 'banco-a' });

    const result = TestBed.runInInjectionContext(() => partnerScopeMatch({} as never, []));
    expect(result).toBeTrue();
    expect(parseUrl).not.toHaveBeenCalled();
  });

  it('redirige (UrlTree) al partner propio cuando el tenant resuelto es distinto (007, D6)', () => {
    const authStore = TestBed.inject(AuthStore);
    const tenantStore = TestBed.inject(TenantStore);
    authStore.setUser({ subject: 'u-a', name: 'Asesor A', roles: [], partnerId: 'p-a', partnerSlug: 'banco-a' });
    tenantStore.setResolution({ kind: 'partner', slug: 'banco-b' });
    const urlTree = {} as UrlTree;
    parseUrl.and.returnValue(urlTree);

    const result = TestBed.runInInjectionContext(() => partnerScopeMatch({} as never, []));
    expect(parseUrl).toHaveBeenCalledWith('/banco-a');
    expect(result).toBe(urlTree);
  });
});
