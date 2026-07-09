import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { AuthStore } from './auth.store';
import type { AuthUser } from './auth-model';

describe('AuthStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('isAuthenticated: false sin usuario, true tras setUser', () => {
    const store = TestBed.inject(AuthStore);
    expect(store.isAuthenticated()).toBe(false);

    const user: AuthUser = { subject: 'u-1', name: 'Ana', roles: ['partner-editor'] };
    store.setUser(user);
    expect(store.isAuthenticated()).toBe(true);
  });

  it('clear: vuelve a no autenticado', () => {
    const store = TestBed.inject(AuthStore);
    store.setUser({ subject: 'u-1', name: 'Ana', roles: ['auditor'] });
    store.clear();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('hasAnyRole: true si el usuario tiene alguno de los roles pedidos', () => {
    const store = TestBed.inject(AuthStore);
    store.setUser({ subject: 'u-1', name: 'Ana', roles: ['auditor'] });
    expect(store.hasAnyRole('platform-admin', 'auditor')).toBe(true);
    expect(store.hasAnyRole('platform-admin', 'partner-editor')).toBe(false);
  });

  it('hasAnyRole: false sin usuario', () => {
    const store = TestBed.inject(AuthStore);
    expect(store.hasAnyRole('auditor')).toBe(false);
  });

  it('partnerId/partnerSlug/isAsesor: null/false sin usuario', () => {
    const store = TestBed.inject(AuthStore);
    expect(store.partnerId()).toBeNull();
    expect(store.partnerSlug()).toBeNull();
    expect(store.isAsesor()).toBe(false);
  });

  it('partnerId/partnerSlug/isAsesor: presentes tras setUser con partner (007, D7)', () => {
    const store = TestBed.inject(AuthStore);
    const user: AuthUser = {
      subject: 'u-asesor-a',
      name: 'Asesor A',
      roles: [],
      partnerId: 'p-abc',
      partnerSlug: 'banco-a',
    };
    store.setUser(user);
    expect(store.partnerId()).toBe('p-abc');
    expect(store.partnerSlug()).toBe('banco-a');
    expect(store.isAsesor()).toBe(true);
  });

  it('partnerId/partnerSlug/isAsesor: null/false para usuario admin sin partner', () => {
    const store = TestBed.inject(AuthStore);
    store.setUser({ subject: 'u-1', name: 'Ana', roles: ['platform-admin'] });
    expect(store.partnerId()).toBeNull();
    expect(store.partnerSlug()).toBeNull();
    expect(store.isAsesor()).toBe(false);
  });
});
