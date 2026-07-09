import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { AuthStore } from '../../../core/auth/auth.store';
import { BrowserRedirect } from '../../../core/interceptors/browser-redirect';
import { NotificationService } from '../../../core/notifications/notification-service';
import { AdminLayout } from './admin-layout';

describe('AdminLayout — cerrar sesión', () => {
  let httpMock: HttpTestingController;
  let redirect: BrowserRedirect;
  let notifications: NotificationService;
  let store: InstanceType<typeof AuthStore>;

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
    redirect = TestBed.inject(BrowserRedirect);
    notifications = TestBed.inject(NotificationService);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => httpMock.verify());

  function create() {
    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  function clickLogout(fixture: ReturnType<typeof create>['fixture']): HTMLButtonElement {
    const button = fixture.nativeElement.querySelector('button[aria-label="Cerrar sesión"]') as HTMLButtonElement;
    button.click();
    return button;
  }

  it('en éxito: limpia el store y redirige al endSessionUrl del reino', async () => {
    const clearSpy = spyOn(store, 'clear').and.callThrough();
    const redirectSpy = spyOn(redirect, 'redirectTo');
    const { fixture } = create();

    clickLogout(fixture);
    // Zoneless: se espera un macrotask para las promesas internas de TanStack Query.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true, endSessionUrl: 'http://idp/logout' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(clearSpy).toHaveBeenCalled();
    expect(redirectSpy).toHaveBeenCalledWith('http://idp/logout');
  });

  it('sin endSessionUrl: redirige a webviewLoginUrl (fallback)', async () => {
    const redirectSpy = spyOn(redirect, 'redirectTo');
    const { fixture } = create();

    clickLogout(fixture);
    await new Promise((resolve) => setTimeout(resolve, 0));

    httpMock.expectOne(`${environment.apiUrl}/auth/logout`).flush({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(redirectSpy).toHaveBeenCalledWith(environment.webviewLoginUrl);
  });

  it('en error: muestra toast y no redirige', async () => {
    const redirectSpy = spyOn(redirect, 'redirectTo');
    const errorSpy = spyOn(notifications, 'error');
    const { fixture } = create();

    clickLogout(fixture);
    await new Promise((resolve) => setTimeout(resolve, 0));

    httpMock
      .expectOne(`${environment.apiUrl}/auth/logout`)
      .flush({ code: 'server_error' }, { status: 500, statusText: 'Server Error' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalled();
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('muestra el nombre del usuario en sesión cuando está poblado', () => {
    store.setUser({ subject: 'u-1', name: 'Ana Admin', roles: ['platform-admin'] });
    const { fixture } = create();
    expect(fixture.nativeElement.textContent).toContain('Ana Admin');
  });
});
