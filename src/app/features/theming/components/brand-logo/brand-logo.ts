import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ThemeStore } from '../../../../core/store/theme.store';
import type { PublicTheme } from '../../../../../shared/partner/public-theme-model';

/**
 * Logo del producto + co-brand del banco del theme activo (FR-001, FR-017).
 * Acepta un `themeOverride` opcional (usado por el `theme-preview` aislado del
 * Back Office, FR-010/012) — sin override, lee el `ThemeStore` global.
 */
@Component({
  selector: 'app-brand-logo',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (theme(); as theme) {
      <div class="flex items-center gap-3">
        <img
          [ngSrc]="logoSrc(theme)"
          width="221"
          height="47"
          class="h-[47px] w-auto"
          [alt]="theme.displayName"
          (error)="hideBrokenImage($event)"
        />
      </div>
    }
  `,
})
export class BrandLogo {
  readonly themeOverride = input<PublicTheme | null>(null);
  /** Cuando el logo se pinta sobre una superficie oscura (footer Popular), usa la variante clara. */
  readonly inverse = input<boolean>(false);

  private readonly themeStore = inject(ThemeStore);
  protected readonly theme = computed(() => this.themeOverride() ?? this.themeStore.theme());

  protected logoSrc(theme: PublicTheme): string {
    return this.inverse() && theme.assets.logoInverseUrl
      ? theme.assets.logoInverseUrl
      : theme.assets.logoUrl;
  }

  /** Oculta el <img> roto sin romper el layout del resto de la marca (FR-017, D10). */
  protected hideBrokenImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
