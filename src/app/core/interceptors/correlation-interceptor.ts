import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

import { AuthStore } from '../auth/auth.store';
import { SalesFlowStore } from '../store/sales-flow.store';

/**
 * Estampa en las peticiones del journey (`/api/journey/*`) los dos datos que el
 * BFF reenvía a las APIs externas: `X-Correlation-Id` (el id del flujo de venta
 * del asesor, mantenido por `SalesFlowStore`) para trazar el consumo de punta a
 * punta, y `_p` (el `partnerKey` del asesor, `AuthStore`) que Cardif exige como
 * identificador del partner. El BFF los reenvía como `correlation-id` y `_p`.
 */
export const correlationInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/journey/')) {
    return next(req);
  }

  // SSR-safe: el flujo de venta es una interacción del navegador; el `HttpClient`
  // del servidor no tiene un flujo activo. Espeja el guard de `csrf-interceptor.ts`.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return next(req);
  }

  const correlationId = inject(SalesFlowStore).correlationId();
  const partnerKey = inject(AuthStore).partnerKey();

  const setHeaders: Record<string, string> = {};
  if (correlationId) {
    setHeaders['X-Correlation-Id'] = correlationId;
  }
  if (partnerKey) {
    setHeaders['_p'] = partnerKey;
  }

  return Object.keys(setHeaders).length > 0 ? next(req.clone({ setHeaders })) : next(req);
};
