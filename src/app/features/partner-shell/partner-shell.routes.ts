import { Routes } from '@angular/router';

/**
 * Feature lazy `partner-shell` — shell del asesor en `/:partnerSlug`
 * (header/footer temeados por el partner) + páginas del módulo. Los guards de
 * tenant/scope/sesión se aplican en la ruta padre (`app.routes.ts`); aquí solo
 * se compone el shell visual y sus páginas.
 *
 * El `**` interno preserva el deep-link actual: cualquier ruta bajo
 * `/:partnerSlug/...` renderiza el shell con la página KYC por defecto (D: hoy
 * todas las cards de webview-login aterrizan en el mismo módulo/vista).
 */
export const PARTNER_SHELL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layouts/partner-shell-layout').then((m) => m.PartnerShellLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/know-your-client/know-your-client').then((m) => m.KnowYourClient),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./pages/know-your-client/know-your-client').then((m) => m.KnowYourClient),
      },
    ],
  },
];
