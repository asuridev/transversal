import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Select "Tipo de documento" (KYC). Reemplaza al `<select>` nativo por un
 * dropdown propio que replica el diseño Figma (panel blanco anclado bajo el
 * input, esquinas inferiores 12px, ítems con divisor, resaltado con tinte de
 * marca) y se comporta **igual** en desktop/tablet/mobile — sin el picker
 * nativo del sistema operativo.
 *
 * Toda la identidad visual sale de los tokens del tema del partner
 * (`--brand-*` → utilidades `text-muted`/`border`/`primary-tint`/`surface`),
 * configurables desde la página de administrador; no hay colores quemados.
 *
 * Implementa `ControlValueAccessor` para seguir usándose con `formControlName`.
 */
@Component({
  selector: 'app-document-type-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-type-select.html',
  host: {
    class: 'relative block w-full',
    '(keydown.escape)': 'close()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DocumentTypeSelect),
      multi: true,
    },
  ],
})
export class DocumentTypeSelect implements ControlValueAccessor {
  readonly options = input<readonly string[]>([]);
  readonly placeholder = input('');

  protected readonly isOpen = signal(false);
  protected readonly value = signal('');
  protected readonly highlightedIndex = signal(-1);
  protected readonly disabled = signal(false);

  protected readonly displayLabel = computed(() => this.value() || this.placeholder());
  protected readonly hasValue = computed(() => this.value() !== '');
  /**
   * Label flotante (Material/Google): sube y se encoge cuando el campo está
   * abierto (equivalente a "enfocado") o cuando ya hay un valor seleccionado.
   */
  protected readonly floated = computed(() => this.isOpen() || this.hasValue());

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

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
    if (isDisabled) {
      this.close();
    }
  }

  /**
   * Sólo alterna con un click real de puntero. Al activar el `<button>` con
   * Enter/Espacio el navegador emite además un `click` sintético (`detail === 0`)
   * que se ignora aquí — ese caso ya lo gestiona `onTriggerKeydown` — para no
   * abrir y cerrar en el mismo evento.
   */
  protected onClick(event: MouseEvent): void {
    if (event.detail === 0) {
      return;
    }
    this.toggle();
  }

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.isOpen() ? this.close() : this.open();
  }

  protected open(): void {
    if (this.disabled()) {
      return;
    }
    this.isOpen.set(true);
    const current = this.options().indexOf(this.value());
    this.highlightedIndex.set(current);
  }

  protected close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.onTouched();
  }

  protected select(option: string): void {
    this.value.set(option);
    this.onChange(option);
    this.close();
  }

  /** Flechas/Home/End navegan; Enter/Espacio abren o confirman el resaltado. */
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.isOpen() ? this.moveHighlight(1) : this.open();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.isOpen() ? this.moveHighlight(-1) : this.open();
        break;
      case 'Home':
        if (this.isOpen()) {
          event.preventDefault();
          this.highlightedIndex.set(0);
        }
        break;
      case 'End':
        if (this.isOpen()) {
          event.preventDefault();
          this.highlightedIndex.set(this.options().length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!this.isOpen()) {
          this.open();
          return;
        }
        this.confirmHighlighted();
        break;
    }
  }

  private moveHighlight(delta: number): void {
    const count = this.options().length;
    if (count === 0) {
      return;
    }
    const next = (this.highlightedIndex() + delta + count) % count;
    this.highlightedIndex.set(next);
  }

  private confirmHighlighted(): void {
    const option = this.options()[this.highlightedIndex()];
    if (option !== undefined) {
      this.select(option);
    }
  }
}
