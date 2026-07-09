import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { ThemeStore } from '../store/theme.store';

/**
 * Único escritor de `document.title` (A6): compone el título de la vista (de
 * `route.title`) con el `displayName` del tenant activo, preservando el theming
 * del título que antes hacía `ThemeApplier.applyTitle`. Reacciona vía un `effect`
 * tanto al cambio de ruta (`updateTitle`) como al cambio de theme (carga async),
 * de modo que ningún orden de llegada deja el título desincronizado. SSR-safe:
 * escribe vía el servicio `Title` (DOCUMENT inyectado), nunca `document` global.
 */
@Injectable({ providedIn: 'root' })
export class TenantTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly themeStore = inject(ThemeStore);
  private readonly routeTitle = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      const composed = this.compose(this.routeTitle(), this.themeStore.theme()?.displayName);
      if (composed) {
        this.title.setTitle(composed);
      }
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.routeTitle.set(this.buildTitle(snapshot));
  }

  private compose(routeTitle: string | undefined, displayName: string | undefined): string {
    if (routeTitle && displayName) {
      return `${routeTitle} — ${displayName}`;
    }
    // Páginas públicas del shell sin `title` de ruta conservan el comportamiento
    // previo: solo el `displayName` del tenant.
    return routeTitle ?? displayName ?? '';
  }
}
