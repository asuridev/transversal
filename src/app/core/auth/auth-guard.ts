import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './auth.store';
import { BrowserRedirect } from '../interceptors/browser-redirect';
import { environment } from '../../../environments/environment';

/**
 * Exige sesión autenticada (cualquier rol). Sin sesión ⇒ redirige a
 * webview-login (dominio externo, 008), no a `/forbidden`: esta ruta se
 * reserva para "autenticado pero sin permiso" (`roleGuard`, D6/006).
 */
export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  if (authStore.isAuthenticated()) {
    return true;
  }
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    inject(BrowserRedirect).redirectTo(environment.webviewLoginUrl);
    return false;
  }
  return inject(Router).createUrlTree(['/forbidden']);
};
