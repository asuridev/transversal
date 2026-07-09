import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ThemeStore } from '../../../../core/store/theme.store';
import type { PublicTheme } from '../../../../../shared/partner/public-theme-model';

/**
 * Footer del producto. Maqueta ÚNICA para todos los partners (Constitución §16,
 * ARCHITECTURE §5): dos franjas apiladas —arriba el sello Vigilado
 * (Superintendencia Financiera) sobre fondo claro/neutro; abajo, sobre la
 * `footer-surface` del partner, el lockup co-brand (banco + divisor + grupo) a
 * la izquierda y la aseguradora del programa (Seguros Alfa) a la derecha—. Los
 * diseños de Occidente (una fila clara) y Popular (dos filas, banda inferior
 * oscura) se unifican en esta misma estructura; solo cambian los tokens de
 * marca (colores/logos), nunca el markup.
 *
 * Todas las imágenes son parametrizadas por partner vía el theme y editables
 * desde el Back Office; cada `<img>` se pinta solo si el asset existe y se
 * oculta si se rompe (FR-017, D10), de modo que nunca queda un placeholder
 * roto. En la franja inferior oscura (footer tipo Popular) el co-brand y la
 * aseguradora usan su variante clara; el sello, al vivir siempre en la franja
 * superior clara, usa siempre su variante base. Acepta `themeOverride` (usado
 * por el `theme-preview` aislado del Back Office).
 */
@Component({
  selector: 'app-brand-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (theme(); as theme) {
      <footer
        class="border-t border-[rgba(234,234,234,0.45)] text-footer-text shadow-[4px_2px_2px_rgba(0,0,0,0.1)]"
      >
        <!-- Franja superior: sello Vigilado sobre fondo claro/neutro (independiente del footer-surface) -->
        @if (sealSrc(theme); as sealSrc) {
          <div class="border-b border-[rgba(234,234,234,0.45)] bg-surface px-6 py-3 md:px-14">
            <!-- Sello centrado en mobile (Figma), alineado a la izquierda desde tablet -->
            <div class="mx-auto flex max-w-[1290px] justify-center md:block">
              <img
                [src]="sealSrc"
                class="h-[18px] w-auto"
                alt="Vigilado por la Superintendencia Financiera de Colombia"
                (error)="hideBrokenImage($event)"
              />
            </div>
          </div>
        }
        <!-- Franja inferior: lockup co-brand (banco + divisor + grupo) a la izquierda,
             aseguradora a la derecha. El divisor vertical entre banco y grupo replica la
             línea del co-brand del Figma (theme-aware vía footer-text: oscuro en footer
             claro tipo Occidente, claro en footer oscuro tipo Popular). -->
        <div class="bg-footer-surface px-6 py-4 md:px-14">
          <!-- Mobile (Figma): co-brand + aseguradora centrados en una fila con logos reducidos.
               Tablet (Figma): agrupados a la izquierda con divisor entre co-brand y aseguradora.
               Desktop: co-brand a la izquierda y aseguradora a la derecha (justify-between). -->
          <div class="mx-auto flex max-w-[1290px] flex-wrap items-center justify-center gap-6 md:justify-start md:gap-6 lg:justify-between lg:gap-4">
            <div class="flex items-center gap-4">
              @if (coBrandBankSrc(theme); as bankSrc) {
                <img
                  [src]="bankSrc"
                  class="h-7 w-auto md:h-[47px]"
                  [alt]="theme.displayName"
                  (error)="hideBrokenImage($event)"
                />
              }
              @if (coBrandBankSrc(theme) && coBrandGroupSrc(theme)) {
                <span class="h-7 w-px bg-footer-text/40 md:h-[47px]" aria-hidden="true"></span>
              }
              @if (coBrandGroupSrc(theme); as groupSrc) {
                <img
                  [src]="groupSrc"
                  class="h-7 w-auto md:h-[47px]"
                  [alt]="theme.displayName"
                  (error)="hideBrokenImage($event)"
                />
              }
            </div>
            @if (insurerSrc(theme); as insurerSrc) {
              <!-- Divisor co-brand↔aseguradora solo en tablet (fila única del Figma tablet). -->
              <span class="hidden h-[47px] w-px bg-footer-text/40 md:block lg:hidden" aria-hidden="true"></span>
              <img [src]="insurerSrc" class="h-4 w-auto md:h-6" alt="Aseguradora del programa" (error)="hideBrokenImage($event)" />
            }
          </div>
        </div>
      </footer>
    }
  `,
})
export class BrandFooter {
  readonly themeOverride = input<PublicTheme | null>(null);

  private readonly themeStore = inject(ThemeStore);
  protected readonly theme = computed(() => this.themeOverride() ?? this.themeStore.theme());

  /**
   * Sello Vigilado del partner. Vive siempre en la franja superior clara, así
   * que usa la variante base (no depende de la luminancia del footer-surface);
   * cae a la inversa solo si no hay base.
   */
  protected sealSrc(theme: PublicTheme): string | undefined {
    return theme.assets.footerSealUrl || theme.assets.footerSealInverseUrl || undefined;
  }

  /** Lockup co-brand del banco del partner. */
  protected coBrandBankSrc(theme: PublicTheme): string | undefined {
    return this.pickVariant(theme, theme.assets.coBrandBankLogoUrl, theme.assets.coBrandBankLogoInverseUrl);
  }

  /** Lockup co-brand del grupo del partner (opcional). */
  protected coBrandGroupSrc(theme: PublicTheme): string | undefined {
    return this.pickVariant(theme, theme.assets.coBrandGroupLogoUrl, theme.assets.coBrandGroupLogoInverseUrl);
  }

  /** Aseguradora del programa del partner (variante clara en footer oscuro). */
  protected insurerSrc(theme: PublicTheme): string | undefined {
    return this.pickVariant(theme, theme.assets.footerInsurerUrl, theme.assets.footerInsurerInverseUrl);
  }

  /**
   * Elige la variante clara solo cuando el footer tiene fondo oscuro; en footer
   * claro usa siempre la base (así una variante clara vieja no oculta el asset
   * base recién subido). Devuelve `undefined` cuando no hay ninguna → el `@if`
   * de la plantilla no pinta la imagen.
   */
  private pickVariant(theme: PublicTheme, base?: string, inverse?: string): string | undefined {
    const preferInverse = isDarkSurface(theme.tokens.colorFooterSurface);
    const chosen = preferInverse ? (inverse ?? base) : (base ?? inverse);
    return chosen || undefined;
  }

  /** Oculta el <img> roto sin romper el layout del footer (FR-017, D10). */
  protected hideBrokenImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}

/** True si el color de fondo (hex) es oscuro según su luminancia relativa (WCAG). */
function isDarkSurface(hex: string | undefined): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return false;
  }
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.5;
}

/** Parsea `#rgb`/`#rrggbb` a [r,g,b] 0-255; `null` si no es un hex reconocible. */
function hexToRgb(hex: string | undefined): [number, number, number] | null {
  if (!hex) {
    return null;
  }
  const value = hex.trim().replace(/^#/, '');
  const full = value.length === 3 ? value.replace(/(.)/g, '$1$1') : value;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
