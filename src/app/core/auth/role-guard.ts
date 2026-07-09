import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import type { AppRole } from './auth-model';
import { AuthStore } from './auth.store';

/** Guard funcional variádico por rol (D10, front-authz.contract §3) — UX, no la frontera de seguridad (FR-006). */
export const roleGuard = (...roles: AppRole[]): CanActivateFn => () => {
  const authStore = inject(AuthStore);
  return authStore.hasAnyRole(...roles) || inject(Router).createUrlTree(['/forbidden']);
};
