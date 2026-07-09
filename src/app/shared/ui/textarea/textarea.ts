import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Átomo de textarea, `ControlValueAccessor` para uso con Reactive Forms (Const. II). Mismo look que `ui-text-input`. */
@Component({
  selector: 'ui-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Textarea),
      multi: true,
    },
  ],
  host: {
    class: 'block',
  },
  template: `
    <textarea
      [rows]="rows()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      class="w-full rounded-[3px] border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text-strong placeholder-admin-placeholder focus:border-admin-primary focus:outline-none disabled:opacity-50"
      (input)="onInput($event)"
      (blur)="onTouched()"
    >{{ value() }}</textarea>
  `,
})
export class Textarea implements ControlValueAccessor {
  readonly rows = input<number>(3);
  readonly placeholder = input<string>('');

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
    const value = (event.target as HTMLTextAreaElement).value;
    this.value.set(value);
    this.onChange(value);
  }
}
