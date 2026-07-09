import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldMessage } from '../../../../shared/ui/field-message/field-message';
import { contrastRatio, meetsAA } from '../../util/contrast-ratio';

/**
 * Variante de `color-field` (ARCHITECTURE §5): picker nativo `<input type="color">`
 * + hex sincronizados. Advierte sobre contraste AA sin invalidar el control ni
 * bloquear la edición (FR-008, D2, D4) — no es un `ValidationError` del form.
 */
@Component({
  selector: 'app-color-field',
  imports: [FieldMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ColorField),
      multi: true,
    },
  ],
  template: `
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <input
          type="color"
          [value]="value()"
          [disabled]="disabled()"
          aria-label="Selector de color"
          class="h-10 w-14 cursor-pointer rounded-[3px] border border-admin-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary focus-visible:ring-offset-2"
          (input)="onColorInput($event)"
          (blur)="onTouched()"
        />
        <input
          type="text"
          [value]="value()"
          [disabled]="disabled()"
          aria-label="Código hexadecimal del color"
          class="w-28 rounded-[3px] border border-admin-border bg-admin-surface px-2 py-2 text-sm uppercase focus:border-admin-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-primary focus-visible:ring-offset-2"
          (input)="onHexInput($event)"
          (blur)="onTouched()"
        />
      </div>
      @if (showWarning()) {
        <ui-field-message variant="warning">
          Contraste {{ ratio().toFixed(2) }}:1 — por debajo del mínimo AA ({{ minimum() }}:1).
        </ui-field-message>
      }
    </div>
  `,
})
export class ColorField implements ControlValueAccessor {
  readonly against = input<string>('#ffffff');
  readonly minimum = input<number>(4.5);

  protected readonly value = signal('#000000');
  protected readonly disabled = signal(false);

  protected readonly ratio = computed(() => contrastRatio(this.value(), this.against()));
  protected readonly showWarning = computed(() => !meetsAA(this.ratio(), false) && this.ratioIsValid());

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '#000000');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onColorInput(event: Event): void {
    this.setValue((event.target as HTMLInputElement).value);
  }

  protected onHexInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      this.setValue(raw);
    }
  }

  private ratioIsValid(): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(this.value()) && /^#[0-9a-fA-F]{6}$/.test(this.against());
  }

  private setValue(value: string): void {
    this.value.set(value);
    this.onChange(value);
  }
}
