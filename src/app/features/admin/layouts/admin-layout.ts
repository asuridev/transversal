import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { injectMutation } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../environments/environment';
import { AuthStore } from '../../../core/auth/auth.store';
import { BrowserRedirect } from '../../../core/interceptors/browser-redirect';
import { NotificationService } from '../../../core/notifications/notification-service';
import { ToastHost } from '../../../core/notifications/toast-host';
import { AuthQueries } from '../../../features/auth/queries/auth-queries';

/**
 * Shell visual del panel: nav lateral + `<router-outlet>`. Chrome neutro
 * (`--admin-*`, D3) — jamás aplica la marca de un partner (SC-009).
 */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-screen flex-col bg-admin-bg font-admin text-admin-text-strong md:flex-row',
  },
  template: `
    <nav
      aria-label="Navegación principal"
      class="sticky top-0 z-20 flex min-h-[56px] flex-row items-center gap-1 bg-admin-primary px-4 py-3 text-white shadow-[0_2px_5px_rgba(0,0,0,0.2)] md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-2 md:px-4 md:py-6 md:shadow-none"
    >
      <div class="flex items-center gap-2 md:mb-6">
        <svg viewBox="0 0 24 24" fill="none" class="h-7 w-7 shrink-0" aria-hidden="true">
          <rect width="24" height="24" rx="5" fill="white" fill-opacity="0.15" />
          <path d="M6 17V7h4.5a3 3 0 0 1 0 6H6m0 0h5a3 3 0 0 1 0 6H6" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="text-lg font-bold leading-tight">
          Back Office
          <span class="block text-xs font-normal text-white/70">BNP Paribas Cardif</span>
        </span>
      </div>

      <a
        routerLink="/admin"
        routerLinkActive="bg-white/15 font-semibold"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
        class="flex min-h-[44px] items-center gap-2 rounded px-3 py-2 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-admin-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5 shrink-0" aria-hidden="true">
          <path d="M3 10.5 12 4l9 6.5M5 9.5V19a1 1 0 0 0 1 1h4v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5h4a1 1 0 0 0 1-1V9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Partners
      </a>

      <div class="flex items-center gap-2 md:mt-auto md:flex-col md:items-stretch md:gap-3 md:border-t md:border-white/15 md:pt-4">
        @if (userName(); as name) {
          <span class="hidden truncate text-xs text-white/70 md:block" [title]="name">
            Sesión de <span class="font-semibold text-white/90">{{ name }}</span>
          </span>
        }
        <button
          type="button"
          [disabled]="logoutMutation.isPending()"
          (click)="onLogout()"
          aria-label="Cerrar sesión"
          class="flex min-h-[44px] items-center gap-2 rounded px-3 py-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-admin-primary disabled:cursor-not-allowed disabled:opacity-60"
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
          {{ logoutMutation.isPending() ? 'Cerrando…' : 'Cerrar sesión' }}
        </button>
      </div>
    </nav>
    <main class="flex-1 p-4 md:p-8">
      <router-outlet />
    </main>
    <app-toast-host />
  `,
})
export class AdminLayout {
  private readonly authQueries = inject(AuthQueries);
  private readonly authStore = inject(AuthStore);
  private readonly browserRedirect = inject(BrowserRedirect);
  private readonly notifications = inject(NotificationService);

  protected readonly userName = computed(() => this.authStore.user()?.name ?? null);

  protected readonly logoutMutation = injectMutation(() => this.authQueries.logout());

  protected onLogout(): void {
    if (this.logoutMutation.isPending()) {
      return;
    }
    this.logoutMutation.mutate(undefined, {
      onSuccess: (res) => {
        this.authStore.clear();
        this.browserRedirect.redirectTo(res.endSessionUrl ?? environment.webviewLoginUrl);
      },
      onError: () => {
        this.notifications.error('No se pudo cerrar sesión. Intenta de nuevo.');
      },
    });
  }
}
