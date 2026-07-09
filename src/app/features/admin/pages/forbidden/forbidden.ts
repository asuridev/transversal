import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LinkButton } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';

/** Destino de `roleGuard`/`authGuard` cuando el acceso se deniega (FR-003, US1.3). */
@Component({
  selector: 'app-forbidden',
  imports: [LinkButton, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-screen flex-col items-center justify-center gap-4 bg-admin-bg p-8 font-admin text-center',
  },
  template: `
    <ui-card class="flex max-w-sm flex-col items-center gap-3 p-8">
      <svg viewBox="0 0 24 24" fill="none" class="h-10 w-10 text-admin-text-soft" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <h1 class="text-2xl font-bold text-admin-text-strong">Acceso denegado</h1>
      <p class="text-admin-text-muted">No tienes permisos para ver esta página.</p>
      <ui-link-button routerLink="/">Volver al inicio</ui-link-button>
    </ui-card>
  `,
})
export class Forbidden {}
