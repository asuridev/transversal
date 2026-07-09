import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type FieldMessageVariant = 'error' | 'warning' | 'success';

const VARIANT_CLASSES: Record<FieldMessageVariant, string> = {
  error: 'text-sm text-red-600',
  warning: 'text-xs text-amber-700',
  success: 'text-sm text-admin-primary',
};

/** Átomo de mensaje de campo (error/advertencia/éxito) — variantes vía `input()` (ARCHITECTURE §5). */
@Component({
  selector: 'ui-field-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p [class]="variantClass()"><ng-content /></p>`,
})
export class FieldMessage {
  readonly variant = input<FieldMessageVariant>('error');

  protected variantClass(): string {
    return VARIANT_CLASSES[this.variant()];
  }
}
