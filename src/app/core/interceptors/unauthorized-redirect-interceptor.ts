import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { BrowserRedirect } from './browser-redirect';
import { environment } from '../../../environments/environment';

/**
 * `401` en `/api/admin/*` ⇒ navegación del browser a webview-login (dominio
 * externo, 008) — sesión ausente/expirada, no un problema de permisos
 * (`/forbidden` es para "autenticado sin permiso", D6/006). Reemplaza el
 * `GET /api/auth/login?returnTo=` directo: la entrada única al reino es
 * webview-login (plan 008); desde ahí el usuario reanuda con silent SSO.
 *
 * Excepción: `GET /api/admin/session` es el sondeo pasivo de sesión (bootstrap,
 * `AuthQueries.session()`). Un `401` ahí es la respuesta **normal** para un
 * anónimo y lo maneja el efecto de bootstrap limpiando el `AuthStore`; NO debe
 * disparar la redirección, o se genera un bucle. Solo los `401` de acciones
 * admin **iniciadas por el usuario** redirigen.
 */
const SESSION_PROBE_SUFFIX = '/admin/session';

export const unauthorizedRedirectInterceptor: HttpInterceptorFn = (req, next) => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const browserRedirect = inject(BrowserRedirect);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        isBrowser &&
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        req.url.includes('/api/admin/') &&
        !req.url.endsWith(SESSION_PROBE_SUFFIX)
      ) {
        browserRedirect.redirectTo(environment.webviewLoginUrl);
      }
      return throwError(() => err);
    }),
  );
};
