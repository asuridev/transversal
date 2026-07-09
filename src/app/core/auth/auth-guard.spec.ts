import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { authGuard } from './auth-guard';
import { AuthStore } from './auth.store';
import { BrowserRedirect } from '../interceptors/browser-redirect';
import { environment } from '../../../environments/environment';

describe('authGuard', () => {
  let redirected: string[];

  beforeEach(() => {
    redirected = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: BrowserRedirect, useValue: { redirectTo: (url: string) => redirected.push(url) } },
      ],
    });
  });

  it('permite el acceso con sesión (store sembrado en SSR/TransferState) — bug 4', () => {
    const store = TestBed.inject(AuthStore);
    store.setUser({ subject: 'u1', name: 'Admin', roles: ['platform-admin'] });

    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('sin sesión (store vacío) ⇒ redirige a webview-login, no a /forbidden (008)', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(false);
    expect(redirected).toEqual([environment.webviewLoginUrl]);
  });
});
