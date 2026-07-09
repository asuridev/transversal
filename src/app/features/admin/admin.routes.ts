import { Routes } from '@angular/router';

import { authGuard } from '../../core/auth/auth-guard';
import { roleGuard } from '../../core/auth/role-guard';
import { partnerEditCanDeactivate } from './pages/partner-edit/partner-edit-guard';

/** Feature lazy `admin` — shell + guards de sesión/rol (D6/D10, front-authz.contract §2/§3). */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, roleGuard('platform-admin', 'partner-editor', 'auditor')],
    loadComponent: () => import('./layouts/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        title: 'Partners',
        loadComponent: () => import('./pages/partners-list/partners-list').then((m) => m.PartnersList),
      },
      {
        path: 'nuevo',
        title: 'Nuevo partner',
        loadComponent: () => import('./pages/partner-create/partner-create').then((m) => m.PartnerCreate),
      },
      {
        path: ':id/editar',
        title: 'Editar partner',
        loadComponent: () => import('./pages/partner-edit/partner-edit').then((m) => m.PartnerEdit),
        canDeactivate: [partnerEditCanDeactivate],
      },
    ],
  },
];
