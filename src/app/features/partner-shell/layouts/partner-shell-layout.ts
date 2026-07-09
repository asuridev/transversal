import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { getDefaultPublicTheme } from '../../../../shared/partner/default-public-theme';
import { AuthStore } from '../../../core/auth/auth.store';
import { BrowserRedirect } from '../../../core/interceptors/browser-redirect';
import { NotificationService } from '../../../core/notifications/notification-service';
import { ToastHost } from '../../../core/notifications/toast-host';
import { SalesFlowStore } from '../../../core/store/sales-flow.store';
import { TenantStore } from '../../../core/store/tenant.store';
import { ThemeStore } from '../../../core/store/theme.store';
import { AuthQueries } from '../../auth/queries/auth-queries';
import { BrandFooter } from '../../theming/components/brand-footer/brand-footer';
import { BrandLogo } from '../../theming/components/brand-logo/brand-logo';
import { ThemeQueries } from '../../theming/queries/theme-queries';

/**
 * Shell visual del asesor (`/:partnerSlug`): header con logo del partner +
 * logout, `<router-outlet>` para las páginas/journeys del módulo, y footer
 * co-branded. La identidad visual sale de los tokens del theme activo
 * (`--brand-*`); la orquestación de sesión reutiliza `AuthQueries`/`ThemeQueries`
 * (mismo patrón que `AdminLayout`).
 */
@Component({
  selector: 'app-partner-shell-layout',
  imports: [RouterOutlet, BrandLogo, BrandFooter, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col bg-surface font-brand text-text-strong">
      <!-- Header: 80px, borde inferior gris del sistema (#ccc, Figma), logo del partner a la izquierda -->
      <header class="flex h-20 items-center justify-between border-b border-[#cccccc] bg-white px-6 md:px-[120px]">
        <app-brand-logo />
        @if (isAuthenticated()) {
          <button
            type="button"
            [disabled]="logoutMutation.isPending()"
            (click)="onLogout()"
            aria-label="Cerrar sesión"
            class="flex min-h-[44px] items-center gap-2 rounded px-3 py-2 text-sm font-medium text-text-strong transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            @if (logoutMutation.isPending()) {
              <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5 shrink-0 animate-spin" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" stroke-opacity="0.3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
            } @else {
              <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5 shrink-0" aria-hidden="true">
                <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            }
            <span class="hidden sm:inline">{{ logoutMutation.isPending() ? 'Cerrando…' : 'Cerrar sesión' }}</span>
          </button>
        }
      </header>
      <main class="relative flex flex-1 flex-col py-8">
        <router-outlet />
      </main>
      <app-brand-footer />
    </div>
    <app-toast-host />
  `,
})
export class PartnerShellLayout {
  protected readonly tenantStore = inject(TenantStore);
  private readonly themeStore = inject(ThemeStore);
  private readonly themeQueries = inject(ThemeQueries);
  private readonly authStore = inject(AuthStore);
  private readonly authQueries = inject(AuthQueries);
  private readonly browserRedirect = inject(BrowserRedirect);
  private readonly notifications = inject(NotificationService);
  private readonly salesFlow = inject(SalesFlowStore);
  private readonly queryClient = inject(QueryClient);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly isAuthenticated = computed(() => this.authStore.isAuthenticated());

  constructor() {
    // Inicio del flujo de venta: el shell es el contenedor persistente del flujo
    // (se construye una vez por entrada; el `<router-outlet>` cambia entre pasos),
    // así que aquí se acuña el `correlationId`. `start()` es idempotente → estable
    // entre pasos. Solo cliente y solo para asesores (el flujo es del asesor).
    if (isPlatformBrowser(this.platformId) && this.authStore.isAsesor()) {
      this.salesFlow.start();
    }
  }

  // Mantiene caliente la caché TanStack (['theme', slug, version]) sembrada por
  // TransferState: navegar entre pasos del mismo partner no dispara re-fetch
  // (FR-010, SC-003). El render usa siempre el ThemeStore síncrono (Constitución I).
  protected readonly themeQuery = injectQuery(() => {
    const theme = this.themeStore.theme() ?? getDefaultPublicTheme();
    return this.themeQueries.bySlug(theme.slug, theme.version, theme);
  });

  // Logout del asesor (FR-008): mismo patrón que `AdminLayout` — expira
  // `bo_session`/`csrf` en el BFF, limpia el store síncrono y redirige al
  // fin de sesión del reino (o a webview-login como fallback).
  protected readonly logoutMutation = injectMutation(() => this.authQueries.logout());

  protected onLogout(): void {
    if (this.logoutMutation.isPending()) {
      return;
    }
    this.logoutMutation.mutate(undefined, {
      onSuccess: (res) => {
        this.authStore.clear();
        this.salesFlow.end();
        // Limpia el caché en memoria (incluye la consulta de contacto, que es PII)
        // para no filtrar datos entre sesiones. Defensa en profundidad: el redirect
        // siguiente ya destruye la caché al recargar el documento.
        this.queryClient.clear();
        this.browserRedirect.redirectTo(res.endSessionUrl ?? environment.webviewLoginUrl);
      },
      onError: () => {
        this.notifications.error('No se pudo cerrar sesión. Intenta de nuevo.');
      },
    });
  }
}
