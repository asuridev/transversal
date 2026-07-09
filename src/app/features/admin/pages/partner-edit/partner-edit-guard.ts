import { CanDeactivateFn } from '@angular/router';

import type { PartnerEdit } from './partner-edit';

/** Aviso de descarte al salir con cambios sin guardar (US3, Edge Case). */
export const partnerEditCanDeactivate: CanDeactivateFn<PartnerEdit> = (component) =>
  !component.hasUnsavedChanges() || confirm('Tienes cambios sin guardar. ¿Salir de todas formas?');
