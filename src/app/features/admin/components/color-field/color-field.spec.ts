import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ColorField } from './color-field';

describe('ColorField', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(ColorField);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  it('keeps the native picker and hex input synced through the CVA value', () => {
    const { component } = create();
    component.writeValue('#336699');
    expect(component.value()).toBe('#336699');
  });

  it('shows a warning when ratio < minimum, without emitting a form error', () => {
    const { fixture, component } = create();
    fixture.componentRef.setInput('against', '#ffffff');
    component.writeValue('#999999');
    fixture.detectChanges();

    expect(component.showWarning()).toBe(true);
  });

  it('does not warn when contrast meets AA', () => {
    const { fixture, component } = create();
    fixture.componentRef.setInput('against', '#ffffff');
    component.writeValue('#000000');
    fixture.detectChanges();

    expect(component.showWarning()).toBe(false);
  });
});
