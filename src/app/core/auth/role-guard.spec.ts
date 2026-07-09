import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { roleGuard } from './role-guard';
import { AuthStore } from './auth.store';

describe('roleGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });

  it('permite el acceso si hasAnyRole es true', () => {
    const store = TestBed.inject(AuthStore);
    store.setUser({ subject: 'u1', name: 'Ana', roles: ['auditor'] });

    const result = TestBed.runInInjectionContext(() => roleGuard('platform-admin', 'auditor')({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('deniega y navega a /forbidden si ningún rol coincide', () => {
    const store = TestBed.inject(AuthStore);
    store.setUser({ subject: 'u1', name: 'Ana', roles: ['auditor'] });

    const result = TestBed.runInInjectionContext(() => roleGuard('platform-admin', 'partner-editor')({} as never, {} as never));
    const router = TestBed.inject(Router);
    expect(result).toEqual(router.createUrlTree(['/forbidden']));
  });

  it('sin usuario ⇒ deniega (variádico con múltiples roles)', () => {
    const result = TestBed.runInInjectionContext(() =>
      roleGuard('platform-admin', 'partner-editor', 'auditor')({} as never, {} as never),
    );
    expect(result).not.toBe(true);
  });
});
