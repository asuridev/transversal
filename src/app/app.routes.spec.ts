import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { BrowserRedirect } from './core/interceptors/browser-redirect';

describe('app.routes — reserved routes precedence', () => {
  let httpMock: HttpTestingController;
  let redirected: string[];

  beforeEach(() => {
    redirected = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: BrowserRedirect, useValue: { redirectTo: (url: string) => redirected.push(url) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('/admin sin sesión redirige a webview-login (008), nunca al partner shell', async () => {
    await RouterTestingHarness.create('/admin');
    expect(redirected).toEqual([environment.webviewLoginUrl]);
  });

  it('/api/theme/popular never matches the partner shell (tenantMatch rejects reserved segments)', async () => {
    const harnessPromise = RouterTestingHarness.create('/api/theme/popular');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const req = httpMock.expectOne(`${environment.apiUrl}/partners/active`);
    req.flush({ slugs: ['popular'] });

    const harness = await harnessPromise;
    expect(harness.routeNativeElement?.textContent).not.toContain('partner-shell');
  });
});
