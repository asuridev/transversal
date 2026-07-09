import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeVariant = 'active' | 'inactive' | 'info' | 'warning';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  active: 'bg-admin-primary/10 text-admin-primary',
  inactive: 'bg-admin-text-soft/20 text-admin-text-muted',
  info: 'bg-admin-link/10 text-admin-link',
  warning: 'bg-amber-100 text-amber-800',
};

/** Átomo de badge de estado — variantes vía `input()` (ARCHITECTURE §5). */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      [class]="'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' + variantClass()"
    >
      <ng-content />
    </span>
  `,
})
export class Badge {
  readonly variant = input<BadgeVariant>('info');

  protected variantClass(): string {
    return VARIANT_CLASSES[this.variant()];
  }
}
