import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LoadingOverlay } from './loading-overlay';

describe('LoadingOverlay', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create() {
    const fixture = TestBed.createComponent(LoadingOverlay);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el mensaje por defecto y el anillo giratorio', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Cargando datos espera un momento');
    expect(el.querySelector('.animate-spin')).not.toBeNull();
    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });

  it('usa el mensaje personalizado cuando se pasa', () => {
    const fixture = create();
    fixture.componentRef.setInput('message', 'Procesando…');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Procesando…');
  });
});
