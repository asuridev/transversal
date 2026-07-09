import { Routes } from '@angular/router';

import { tenantMatch } from './core/tenant/tenant-guard';
import { partnerScopeMatch } from './core/tenant/partner-scope-guard';
import { authGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/admin/pages/forbidden/forbidden').then((m) => m.Forbidden),
  },
  {
    path: ':partnerSlug',
    canMatch: [tenantMatch, partnerScopeMatch],
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/partner-shell/partner-shell.routes').then((m) => m.PARTNER_SHELL_ROUTES),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: '**',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
];
