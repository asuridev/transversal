import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { TenantStore } from '../store/tenant.store';

/**
 * Restringe el shell `/:partnerSlug` al **asesor dueño** de ese partner (007,
 * D6). Junto al `authGuard` (que corre en `canActivate`), impide exponer la
 * vista a anónimos y a admins:
 *
 * - No autenticado ⇒ delega en `authGuard` (redirige al SSO de webview-login).
 * - Autenticado pero no asesor (admin) ⇒ a su home `/admin`.
 * - Asesor cuyo partner coincide con el tenant resuelto ⇒ pasa.
 * - Asesor de otro partner ⇒ a su propio partner.
 *
 * NO es la frontera de seguridad dura: el BFF rechaza igual cualquier acceso
 * cruzado server-side (ver `journey-authz.contract.md`); este guard evita
 * mostrar contenido ajeno en el navegador.
 */
export const partnerScopeMatch: CanMatchFn = () => {
  const authStore = inject(AuthStore);
  const tenantStore = inject(TenantStore);
  const router = inject(Router);

  if (!authStore.isAuthenticated()) {
    // Anónimo ⇒ que el `authGuard` (canActivate) dispare el login del SSO.
    return true;
  }

  if (!authStore.isAsesor()) {
    // Admin autenticado ⇒ no ve el shell de partner; a su página de admin.
    return router.parseUrl('/admin');
  }

  const sessionPartner = authStore.partnerSlug();
  const routeTenant = tenantStore.partnerSlug();
  if (routeTenant === sessionPartner) {
    return true;
  }

  return router.parseUrl(`/${sessionPartner}`);
};
