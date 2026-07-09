import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ContactConfirm, type ContactSelection } from './contact-confirm';
import type { PersonalInformation } from '../../models/contact-info-model';

const info = {
  documentType: 'CC',
  documentNumber: '10282664',
  firstName: 'JUAN',
  secondName: '',
  surname: 'GONZALEZ',
  secondSurname: '',
  birthDate: '',
  gender: '',
  civilStatus: '',
  city: '',
  dependents: '',
  department: '',
  nationality: '',
  income: '',
  emails: [{ email: 'A***@x.com' }, { email: 'B***@x.com' }],
  cellPhoneNumber: [
    { cellPhoneNumber: '*******8678', indicative: '57' },
    { cellPhoneNumber: '*******9211', indicative: '57' },
  ],
} satisfies PersonalInformation;

describe('ContactConfirm — paso de confirmación', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function create() {
    const fixture = TestBed.createComponent(ContactConfirm);
    fixture.componentRef.setInput('info', info);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  it('sin selección: no se puede continuar', () => {
    const { component } = create();
    expect(component.canContinue()).toBeFalse();
  });

  it('con solo correo elegido sigue deshabilitado', () => {
    const { component } = create();
    component.selectedEmailIndex.set(0);
    expect(component.canContinue()).toBeFalse();
  });

  it('con correo y teléfono elegidos se habilita y emite el par seleccionado', () => {
    const { component } = create();
    let emitted: ContactSelection | undefined;
    component.continued.subscribe((s: ContactSelection) => (emitted = s));

    component.selectedEmailIndex.set(1);
    component.selectedPhoneIndex.set(0);
    expect(component.canContinue()).toBeTrue();

    component.onContinue();
    expect(emitted).toEqual({ email: info.emails[1], phone: info.cellPhoneNumber[0] });
  });

  it('onContinue no emite si falta una selección', () => {
    const { component } = create();
    let called = false;
    component.continued.subscribe(() => (called = true));
    component.selectedEmailIndex.set(0);
    component.onContinue();
    expect(called).toBeFalse();
  });
});
