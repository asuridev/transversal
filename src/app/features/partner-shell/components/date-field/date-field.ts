import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Nombres en español para el encabezado del calendario (Figma: "Abril 2017"). */
const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** Etiquetas de día, semana iniciando en domingo (Figma: Dom…Sab). */
const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'] as const;

/** Celda de la grilla: un día del mes visible (`null` = hueco de relleno). */
interface CalendarCell {
  readonly day: number;
  readonly iso: string;
  /** `true` si es posterior a hoy: no seleccionable (una expedición no es futura). */
  readonly disabled: boolean;
}

/**
 * Campo "Fecha de expedición" (KYC). Reemplaza al `<input type="date">` nativo
 * por un calendario propio que replica el diseño Figma (popover blanco anclado
 * bajo el input, radio 8, sombra suave; encabezado mes/año con chevrons, fila de
 * etiquetas de día y grilla de 7 columnas; día seleccionado como círculo con el
 * color primario de la marca) y se comporta **igual** en desktop/tablet/mobile —
 * sin el date-picker nativo del sistema operativo.
 *
 * Toda la identidad visual sale de los tokens del tema del partner
 * (`--brand-*` → utilidades `text-strong`/`text-muted`/`primary`/`surface`),
 * configurables desde la página de administrador; no hay colores quemados.
 *
 * El valor del control es un ISO `YYYY-MM-DD`; la UI lo muestra como DD/MM/AAAA.
 * Implementa `ControlValueAccessor` para seguir usándose con `formControlName`.
 */
@Component({
  selector: 'app-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './date-field.html',
  host: {
    class: 'relative block w-full',
    '(keydown.escape)': 'close()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateField),
      multi: true,
    },
  ],
})
export class DateField implements ControlValueAccessor {
  readonly placeholder = input('');

  protected readonly weekdayLabels = WEEKDAY_LABELS;

  /** Hoy en ISO local; tope superior seleccionable (no se permiten fechas futuras). */
  private readonly todayIso = isoOf(new Date());

  protected readonly isOpen = signal(false);
  protected readonly disabled = signal(false);
  /** Fecha seleccionada como ISO `YYYY-MM-DD`, o `''` si no hay. */
  protected readonly value = signal('');
  /** Mes visible en el popover (0-11) y su año, independientes de la selección. */
  protected readonly viewMonth = signal(new Date().getMonth());
  protected readonly viewYear = signal(new Date().getFullYear());

  protected readonly hasValue = computed(() => this.value() !== '');

  /**
   * Label flotante (Material/Google): sube y se encoge cuando el campo está
   * abierto (equivalente a "enfocado") o cuando ya hay una fecha seleccionada.
   */
  protected readonly floated = computed(() => this.isOpen() || this.hasValue());

  /** Etiqueta del trigger: DD/MM/AAAA o el placeholder. */
  protected readonly displayLabel = computed(() => {
    const iso = this.value();
    if (iso === '') {
      return this.placeholder();
    }
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  });

  /** Encabezado "Mes Año" del popover (p. ej. "Abril 2017"). */
  protected readonly monthLabel = computed(
    () => `${MONTH_NAMES[this.viewMonth()]} ${this.viewYear()}`,
  );

  /**
   * `true` mientras el mes visible sea anterior al mes actual: solo entonces
   * tiene sentido avanzar. En el mes de hoy (o posterior) se bloquea el avance
   * para no exponer meses completamente futuros.
   */
  protected readonly canGoNext = computed(() => {
    const now = new Date();
    return this.viewYear() < now.getFullYear() ||
      (this.viewYear() === now.getFullYear() && this.viewMonth() < now.getMonth());
  });

  /**
   * Semanas del mes visible: matriz 6×7 con huecos `null` antes del día 1 y
   * después del último, para alinear cada día bajo su columna (domingo→sábado).
   */
  protected readonly weeks = computed<readonly (CalendarCell | null)[][]>(() => {
    const month = this.viewMonth();
    const year = this.viewYear();
    const firstWeekday = new Date(year, month, 1).getDay(); // 0=domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (CalendarCell | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
      cells.push({ day, iso, disabled: iso > this.todayIso });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const rows: (CalendarCell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    const iso = value ?? '';
    this.value.set(iso);
    if (iso !== '') {
      const [year, month] = iso.split('-').map(Number);
      this.viewYear.set(year);
      this.viewMonth.set(month - 1);
    }
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
   * que se ignora aquí — para no abrir y cerrar en el mismo evento.
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
    // Al abrir sin selección, muestra el mes actual; con selección, el suyo.
    const iso = this.value();
    if (iso !== '') {
      const [year, month] = iso.split('-').map(Number);
      this.viewYear.set(year);
      this.viewMonth.set(month - 1);
    }
    this.isOpen.set(true);
  }

  protected close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.onTouched();
  }

  protected prevMonth(): void {
    const month = this.viewMonth();
    if (month === 0) {
      this.viewMonth.set(11);
      this.viewYear.update((y) => y - 1);
    } else {
      this.viewMonth.set(month - 1);
    }
  }

  protected nextMonth(): void {
    if (!this.canGoNext()) {
      return;
    }
    const month = this.viewMonth();
    if (month === 11) {
      this.viewMonth.set(0);
      this.viewYear.update((y) => y + 1);
    } else {
      this.viewMonth.set(month + 1);
    }
  }

  protected select(cell: CalendarCell): void {
    if (cell.disabled) {
      return;
    }
    this.value.set(cell.iso);
    this.onChange(cell.iso);
    this.close();
  }
}

/** Rellena a 2 dígitos (mes/día) para componer el ISO. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local → ISO `YYYY-MM-DD` (sin corrimiento de zona horaria). */
function isoOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
