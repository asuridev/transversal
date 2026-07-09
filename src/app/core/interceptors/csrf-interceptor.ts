import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function readCsrfCookie(document: Document): string | null {
  const match = document.cookie.match(/(?:^|; )csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Añade `X-CSRF-Token` (de la cookie `csrf`) en mutaciones hacia `/api/admin/*` y `/api/auth/*` (D4/D10). */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const isGuarded = req.url.includes('/api/admin/') || req.url.includes('/api/auth/');
  if (!MUTATING_METHODS.has(req.method) || !isGuarded) {
    return next(req);
  }

  // SSR-safe: la cookie `csrf` es del navegador; el `HttpClient` del servidor no
  // la tiene y `document` no existe ahí. Leerla vía DI (`DOCUMENT`) tras el guard
  // de plataforma, espejando `unauthorized-redirect-interceptor.ts`.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return next(req);
  }

  const csrfToken = readCsrfCookie(inject(DOCUMENT));
  if (!csrfToken) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { 'X-CSRF-Token': csrfToken } }));
};
