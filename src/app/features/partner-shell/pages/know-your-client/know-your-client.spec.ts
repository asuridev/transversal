import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { KnowYourClient } from './know-your-client';

describe('KnowYourClient — validación del formulario', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(KnowYourClient);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  it('arranca inválido: todos los campos y consentimientos son obligatorios', () => {
    const { component } = create();
    expect(component.form.invalid).toBeTrue();
  });

  it('es válido cuando se completan los campos y ambos consentimientos', () => {
    const { component } = create();
    component.form.setValue({
      tipoDocumento: 'Cédula de ciudadanía',
      numeroDocumento: '1020304050',
      fechaExpedicion: '2015-06-01',
      consentAsesor: true,
      consentDatos: true,
    });
    expect(component.form.valid).toBeTrue();
  });

  it('sigue inválido si falta un consentimiento (requiredTrue)', () => {
    const { component } = create();
    component.form.setValue({
      tipoDocumento: 'Pasaporte',
      numeroDocumento: 'X123',
      fechaExpedicion: '2020-01-01',
      consentAsesor: true,
      consentDatos: false,
    });
    expect(component.form.invalid).toBeTrue();
  });

  it('onSubmit con formulario inválido marca los controles como touched', () => {
    const { component } = create();
    component.onSubmit();
    expect(component.form.touched).toBeTrue();
  });
});
