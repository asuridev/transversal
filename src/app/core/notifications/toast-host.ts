import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationService } from './notification-service';

/**
 * Pinta las notificaciones activas del `NotificationService`. Se monta UNA vez en el
 * shell del panel (`admin-layout`) para cubrir todas sus páginas.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:right-4">
      @for (toast of notifications.toasts(); track toast.id) {
        <div
          role="status"
          aria-live="polite"
          class="pointer-events-auto flex max-w-sm items-start gap-2 rounded-[5px] px-4 py-3 text-sm shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
          [class]="toast.kind === 'success' ? 'bg-admin-primary text-white' : 'bg-red-600 text-white'"
        >
          <svg viewBox="0 0 24 24" fill="none" class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            @if (toast.kind === 'success') {
              <path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            } @else {
              <path d="M12 8v5m0 3h.01M10.3 4.3 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a1.5 1.5 0 0 0-2.6 0Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            }
          </svg>
          <span class="flex-1">{{ toast.text }}</span>
          <button
            type="button"
            class="shrink-0 rounded p-0.5 opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Cerrar notificación"
            (click)="notifications.dismiss(toast.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly notifications = inject(NotificationService);
}
