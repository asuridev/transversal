import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input } from '@angular/core';

import type { PublicTheme } from '../../../../../shared/partner/public-theme-model';
import { toScopedCssVars } from '../../../../core/theme/theme-css-vars';
import { BrandFooter } from '../../../theming/components/brand-footer/brand-footer';
import { BrandLogo } from '../../../theming/components/brand-logo/brand-logo';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import type { ThemeDraft } from '../../models/partner-admin-model';
import { applyScopedTheme } from '../../util/scoped-theme';

const PREVIEW_SLUG = '__preview__';

/**
 * Lienzo de preview en vivo, aislado (FR-010/011/012, SC-002/009). Escribe los
 * `--brand-*` del borrador SOLO en su propio host (`scoped-theme.ts`, D1) —
 * nunca en `:root`/`ThemeStore` — y renderiza los mismos átomos que la
 * experiencia real (`brand-logo`, `brand-footer`, `ui/`) para fidelidad.
 */
@Component({
  selector: 'app-theme-preview',
  imports: [BrandLogo, BrandFooter, Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
  templateUrl: './theme-preview.html',
})
export class ThemePreview {
  readonly draft = input.required<ThemeDraft>();
  readonly displayName = input<string>('Partner');

  private readonly hostRef = inject(ElementRef<HTMLElement>);

  protected readonly previewTheme = computed<PublicTheme>(() => ({
    slug: PREVIEW_SLUG,
    displayName: this.displayName(),
    version: 0,
    tokens: this.draft().tokens,
    assets: this.draft().assets,
    legal: this.draft().legal,
    typography: this.draft().typography,
  }));

  constructor() {
    effect(() => {
      const cssVars = toScopedCssVars(this.previewTheme());
      applyScopedTheme(this.hostRef.nativeElement, cssVars);
    });
  }
}
