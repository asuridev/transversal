import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

import { SalesFlowStore } from '../store/sales-flow.store';

/**
 * Estampa en las peticiones del journey (`/api/journey/*`) el `X-Correlation-Id`
 * (el id del flujo de venta del asesor, mantenido por `SalesFlowStore`) para
 * trazar el consumo de punta a punta. El BFF lo reenvía como `correlation-id`.
 *
 * El `partnerKey` (`_p`) que Cardif exige NO viaja desde el cliente: el BFF lo
 * deriva de la sesión sellada (`requirePartnerScope`), de modo que el secreto
 * nunca sale del servidor.
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

  return correlationId ? next(req.clone({ setHeaders: { 'X-Correlation-Id': correlationId } })) : next(req);
};
