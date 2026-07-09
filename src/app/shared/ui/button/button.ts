import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type ButtonVariant = 'admin-primary' | 'admin-secondary' | 'ghost' | 'danger' | 'brand-primary';
export type ButtonSize = 'md' | 'sm';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  'admin-primary':
    'bg-admin-primary text-white hover:opacity-90 disabled:opacity-50 focus-visible:ring-admin-primary',
  'admin-secondary':
    'bg-admin-surface text-admin-text-strong border border-admin-border hover:bg-admin-bg disabled:opacity-50 focus-visible:ring-admin-primary',
  ghost:
    'bg-transparent text-admin-link hover:bg-admin-bg disabled:opacity-50 focus-visible:ring-admin-primary',
  danger: 'bg-red-600 text-white hover:opacity-90 disabled:opacity-50 focus-visible:ring-red-600',
  // Lee --brand-* por herencia del host donde se renderiza (theme-preview aislado,
  // D1) — nunca colores admin fijos; usado dentro de la experiencia de marca.
  'brand-primary':
    'bg-[var(--brand-primary)] text-[var(--brand-surface)] hover:opacity-90 disabled:opacity-50 focus-visible:ring-[var(--brand-primary)]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-[44px] px-4 py-2 text-sm',
  sm: 'min-h-[44px] px-3 py-1.5 text-xs',
};

/** Átomo de botón — variantes vía `input()` (ARCHITECTURE §5); nunca clases ad-hoc en templates de feature. */
@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled()"
      [class]="
        'inline-flex items-center justify-center gap-2 rounded-[3px] font-medium transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
        sizeClass() +
        ' ' +
        variantClass()
      "
    >
      <ng-content />
    </button>
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('admin-primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input<boolean>(false);

  protected variantClass(): string {
    return VARIANT_CLASSES[this.variant()];
  }

  protected sizeClass(): string {
    return SIZE_CLASSES[this.size()];
  }
}

/**
 * Variante de navegación del mismo átomo (ARCHITECTURE §5): renderiza un
 * `<a routerLink>` real en vez de un `<button>` — usar `ui-link-button` para
 * acciones que navegan, nunca `[routerLink]` sobre `ui-button` (crea un
 * segundo tab-stop invisible sobre el host, ya que `RouterLink` añade
 * `tabindex`/click-handler al elemento donde se coloca).
 */
@Component({
  selector: 'ui-link-button',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="routerLink()"
      [class]="
        'inline-flex items-center justify-center gap-2 rounded-[3px] font-medium transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
        sizeClass() +
        ' ' +
        variantClass()
      "
    >
      <ng-content />
    </a>
  `,
})
export class LinkButton {
  readonly routerLink = input.required<string | unknown[]>();
  readonly variant = input<ButtonVariant>('admin-primary');
  readonly size = input<ButtonSize>('md');

  protected variantClass(): string {
    return VARIANT_CLASSES[this.variant()];
  }

  protected sizeClass(): string {
    return SIZE_CLASSES[this.size()];
  }
}
