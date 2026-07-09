import { isPlatformBrowser } from '@angular/common';
import {
  ApplicationConfig,
  PLATFORM_ID,
  TransferState,
  effect,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { injectQuery, provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { ThemeStore } from './core/store/theme.store';
import { readThemeTransferState } from './core/theme/theme-transfer';
import { AuthStore } from './core/auth/auth.store';
import { readSessionTransferState } from './core/auth/session-transfer';
import { AuthQueries } from './features/auth/queries/auth-queries';
import { unauthorizedRedirectInterceptor } from './core/interceptors/unauthorized-redirect-interceptor';
import { csrfInterceptor } from './core/interceptors/csrf-interceptor';
import { correlationInterceptor } from './core/interceptors/correlation-interceptor';
import { SalesFlowStore } from './core/store/sales-flow.store';
import { readPartnersTransferState } from './core/tenant/partners-transfer';
import { TenantTitleStrategy } from './core/theme/tenant-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: TenantTitleStrategy },
    provideHttpClient(
      withInterceptors([csrfInterceptor, correlationInterceptor, unauthorizedRedirectInterceptor]),
    ),
    provideTanStackQuery(new QueryClient()),
    provideClientHydration(withEventReplay()),
    // Cliente: siembra el ThemeStore con el theme ya resuelto en SSR (TransferState),
    // sin re-resolver ni re-pedir (FR-007/014) — idempotente con el HTML SSR (SC-002).
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const theme = readThemeTransferState(inject(TransferState));
      if (theme) {
        inject(ThemeStore).apply(theme);
      }
    }),
    // Siembra síncrona de la sesión desde TransferState (007, bugs 2/4): el SSR
    // ya deselló `bo_session` y la pasó aquí, de modo que el AuthStore está
    // poblado ANTES de la primera navegación/guards (sin FOUC de autorización ni
    // round-trip). Idempotente con el HTML SSR. Solo cliente.
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const user = readSessionTransferState(inject(TransferState));
      if (user) {
        inject(AuthStore).setUser(user);
      }
    }),
    // Siembra la queryCache con los slugs de partners activos ya resueltos en SSR
    // (A7): así `tenantMatch` (`ensureQueryData(['partners','active'])`) no
    // re-pide `GET /api/partners/active` en la primera navegación cliente. Espeja
    // la siembra de theme/session. Solo cliente.
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const slugs = readPartnersTransferState(inject(TransferState));
      if (slugs) {
        inject(QueryClient).setQueryData<ReadonlySet<string>>(['partners', 'active'], new Set(slugs));
      }
    }),
    // Bootstrap de sesión (D10, front-authz.contract §4): whoami vía TanStack
    // Query → AuthStore síncrono. Refresco/fallback sobre la siembra de
    // TransferState (p. ej. si expira). Solo cliente — la sesión llega por cookie
    // httpOnly que el SSR no puede leer de forma reactiva aquí.
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const authStore = inject(AuthStore);
      const salesFlow = inject(SalesFlowStore);
      const authQueries = inject(AuthQueries);
      const session = injectQuery(() => authQueries.session());
      effect(() => {
        if (session.data()) {
          authStore.setUser(session.data() ?? null);
        } else if (session.isError()) {
          // Sesión perdida/expirada: el correlation-id del flujo muere con la
          // sesión (no solo en el logout explícito).
          authStore.clear();
          salesFlow.end();
        }
      });
    }),
  ]
};
