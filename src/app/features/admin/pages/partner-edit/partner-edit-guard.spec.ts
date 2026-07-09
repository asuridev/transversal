import { partnerEditCanDeactivate } from './partner-edit-guard';
import type { PartnerEdit } from './partner-edit';

/** Stub mínimo: el guard solo consume `hasUnsavedChanges()`. */
function componentWith(hasUnsavedChanges: boolean): PartnerEdit {
  return { hasUnsavedChanges: () => hasUnsavedChanges } as unknown as PartnerEdit;
}

describe('partnerEditCanDeactivate', () => {
  const route = {} as never;
  const state = {} as never;

  it('permite salir sin confirmación cuando no hay cambios', () => {
    const confirmSpy = spyOn(window, 'confirm');
    const result = partnerEditCanDeactivate(componentWith(false), route, state, state);
    expect(result).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('con cambios sin guardar, pide confirmación y respeta el "aceptar"', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    expect(partnerEditCanDeactivate(componentWith(true), route, state, state)).toBe(true);
  });

  it('con cambios sin guardar, respeta el "cancelar" (bloquea la salida)', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    expect(partnerEditCanDeactivate(componentWith(true), route, state, state)).toBe(false);
  });
});
