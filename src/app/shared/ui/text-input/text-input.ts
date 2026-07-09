import { ChangeDetectionStrategy, Component, forwardRef, input, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Átomo de input de texto, `ControlValueAccessor` para uso con Reactive Forms (Const. II). */
@Component({
  selector: 'ui-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextInput),
      multi: true,
    },
  ],
  host: {
    class: 'block',
    '[attr.id]': 'null',
  },
  template: `
    <input
      [id]="inputId()"
      [type]="type()"
      [placeholder]="placeholder()"
      [value]="value()"
      [disabled]="disabled()"
      class="w-full rounded-[3px] border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text-strong placeholder-admin-placeholder focus:border-admin-primary focus:outline-none disabled:opacity-50"
      (input)="onInput($event)"
      (blur)="onTouched()"
    />
  `,
})
export class TextInput implements ControlValueAccessor {
  readonly type = input<'text' | 'email' | 'url'>('text');
  readonly placeholder = input<string>('');
  readonly inputId = input<string | null>(null, { alias: 'id' });
  readonly valueChange = output<string>();

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
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

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
    this.valueChange.emit(value);
  }
}
