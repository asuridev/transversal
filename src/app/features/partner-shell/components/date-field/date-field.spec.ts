import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DateField } from './date-field';

describe('DateField — calendario custom (CVA)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(DateField);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  it('arranca cerrado', () => {
    const { component } = create();
    expect(component.isOpen()).toBeFalse();
  });

  it('writeValue(ISO) fija el valor y posiciona el mes visible en esa fecha', () => {
    const { component } = create();
    component.writeValue('2015-06-01');
    expect(component.value()).toBe('2015-06-01');
    expect(component.viewYear()).toBe(2015);
    expect(component.viewMonth()).toBe(5); // junio (0-based)
  });

  it('displayLabel muestra la fecha como DD/MM/AAAA', () => {
    const { component } = create();
    component.writeValue('2015-06-01');
    expect(component.displayLabel()).toBe('01/06/2015');
  });

  it('displayLabel cae al placeholder cuando no hay valor', () => {
    const { fixture, component } = create();
    fixture.componentRef.setInput('placeholder', 'Fecha de expedición del documento');
    expect(component.displayLabel()).toBe('Fecha de expedición del documento');
  });

  it('monthLabel arma "Mes Año" en español', () => {
    const { component } = create();
    component.writeValue('2017-04-19');
    expect(component.monthLabel()).toBe('Abril 2017');
  });

  it('select() emite el ISO por onChange y cierra el popover', () => {
    const { component } = create();
    let emitted = '';
    component.registerOnChange((v: string) => (emitted = v));
    component.open();
    component.select({ day: 19, iso: '2017-04-19' });
    expect(emitted).toBe('2017-04-19');
    expect(component.value()).toBe('2017-04-19');
    expect(component.isOpen()).toBeFalse();
  });

  it('prevMonth/nextMonth cambian el mes visible sin tocar la selección', () => {
    const { component } = create();
    component.writeValue('2017-04-19');
    component.nextMonth();
    expect(component.viewMonth()).toBe(4); // mayo
    expect(component.value()).toBe('2017-04-19');
    component.prevMonth();
    component.prevMonth();
    expect(component.viewMonth()).toBe(2); // marzo
    expect(component.value()).toBe('2017-04-19');
  });

  it('prevMonth cruza el límite de año (enero → diciembre anterior)', () => {
    const { component } = create();
    component.writeValue('2020-01-15');
    component.prevMonth();
    expect(component.viewMonth()).toBe(11); // diciembre
    expect(component.viewYear()).toBe(2019);
  });

  it('la grilla del mes ubica el día 1 bajo su columna (offset de domingo)', () => {
    const { component } = create();
    component.writeValue('2017-04-19'); // 1 abr 2017 = sábado (getDay()=6)
    const firstWeek = component.weeks()[0] as (null | { day: number })[];
    expect(firstWeek.slice(0, 6).every((c: unknown) => c === null)).toBeTrue();
    expect(firstWeek[6]?.day).toBe(1);
  });

  it('setDisabledState(true) cierra el popover y bloquea la apertura', () => {
    const { component } = create();
    component.open();
    component.setDisabledState(true);
    expect(component.isOpen()).toBeFalse();
    component.open();
    expect(component.isOpen()).toBeFalse();
  });

  // --- Restricción: no se permiten fechas posteriores a hoy ---

  /** Busca la celda de un ISO dado dentro de la grilla del mes visible. */
  function findCell(component: any, iso: string) {
    for (const week of component.weeks()) {
      for (const cell of week) {
        if (cell && cell.iso === iso) {
          return cell;
        }
      }
    }
    return null;
  }

  function isoOf(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  it('marca disabled los días posteriores a hoy y habilitados hoy/ayer', () => {
    const { component } = create();
    const today = new Date();
    // Posiciona el mes visible en el mes actual.
    component.writeValue(isoOf(today));

    const todayCell = findCell(component, isoOf(today));
    expect(todayCell?.disabled).toBeFalse();

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayCell = findCell(component, isoOf(yesterday));
    // Ayer siempre existe en el mismo u otro mes; si cae en el mes visible, no está deshabilitado.
    if (yesterdayCell) {
      expect(yesterdayCell.disabled).toBeFalse();
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowCell = findCell(component, isoOf(tomorrow));
    // Si mañana cae en el mes visible, debe estar deshabilitado.
    if (tomorrowCell) {
      expect(tomorrowCell.disabled).toBeTrue();
    }
  });

  it('select() sobre una celda futura (disabled) no cambia nada', () => {
    const { component } = create();
    let emitted: string | null = null;
    component.registerOnChange((v: string) => (emitted = v));
    component.open();
    component.select({ day: 1, iso: '2999-01-01', disabled: true });
    expect(component.value()).toBe('');
    expect(emitted).toBeNull();
    expect(component.isOpen()).toBeTrue();
  });

  it('canGoNext es false en el mes actual y nextMonth no avanza', () => {
    const { component } = create();
    const today = new Date();
    component.writeValue(isoOf(today)); // mes visible = mes actual
    expect(component.canGoNext()).toBeFalse();
    const month = component.viewMonth();
    component.nextMonth();
    expect(component.viewMonth()).toBe(month);
  });

  it('canGoNext es true en un mes pasado y nextMonth sí avanza', () => {
    const { component } = create();
    component.writeValue('2015-06-01');
    expect(component.canGoNext()).toBeTrue();
    component.nextMonth();
    expect(component.viewMonth()).toBe(6); // julio
  });
});
