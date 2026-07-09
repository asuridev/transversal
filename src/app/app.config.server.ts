import { ApplicationConfig, REQUEST, TransferState, inject, mergeApplicationConfig, provideAppInitializer } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { ThemeStore } from './core/store/theme.store';
import { resolveActiveTheme } from './core/theme/resolve-active-theme.server';
import { writeThemeTransferState } from './core/theme/theme-transfer';
import { resolveTenant } from './core/tenant/resolve-tenant';
import { AuthStore } from './core/auth/auth.store';
import type { AuthUser } from './core/auth/auth-model';
import { writeSessionTransferState } from './core/auth/session-transfer';
import { writePartnersTransferState } from './core/tenant/partners-transfer';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Resuelve el theme ANTES de pintar (FR-006): sin esto el HTML SSR se serializaría
    // sin marca y el cliente la aplicaría después, reintroduciendo el FOUC (D1).
    provideAppInitializer(async () => {
      const request = inject(REQUEST);
      if (!request) {
        // Sin request real (p.ej. extracción estática de rutas del builder en build
        // time): no hay pathname que resolver ni FS real para la persistencia in-process.
        return;
      }

      const transferState = inject(TransferState);
      const themeStore = inject(ThemeStore);
      // Inyectar en el contexto síncrono (antes de cualquier `await`): tras un
      // await se pierde el injection context y `inject()` lanzaría.
      const authStore = inject(AuthStore);

      // Import diferido: `node:sqlite` (persistencia 002) no debe cargarse durante
      // la extracción estática de rutas del builder, solo al atender una request real.
      const { createPartnerRepository } = await import('../server/persistence/persistence-config.ts');

      const pathname = new URL(request.url).pathname;
      const repository = createPartnerRepository();
      const activeSlugs = new Set(await repository.findActiveSlugs());
      // Persistir los slugs activos para sembrar la queryCache del cliente (A7):
      // evita que `tenantMatch` re-pida `GET /api/partners/active` tras hidratar.
      writePartnersTransferState(transferState, [...activeSlugs]);
      const resolution = resolveTenant({ pathname }, activeSlugs);

      const theme = await resolveActiveTheme(resolution, repository);
      writeThemeTransferState(transferState, theme);
      themeStore.apply(theme);

      // Sesión en SSR (007, bugs 2/4): desellar `bo_session` para que los guards
      // (`authGuard`/`roleGuard`/`partnerScopeMatch`) vean la sesión durante el
      // render server e hidratación, y sembrarla en el cliente vía TransferState
      // (espeja el pipeline del theme). Falla segura: cualquier error ⇒ anónimo.
      try {
        const sealKey = process.env['SESSION_SEAL_KEY'];
        const cookieHeader = request.headers.get('cookie') ?? undefined;
        if (sealKey && cookieHeader) {
          const { parseCookies } = await import('../server/security/cookie-utils.ts');
          const { createSessionSeal } = await import('../server/security/session-seal.ts');
          const raw = parseCookies(cookieHeader)['bo_session'];
          const sealed = raw ? createSessionSeal({ key: sealKey }).unseal(raw) : null;
          if (sealed) {
            const user: AuthUser = {
              subject: sealed.sub,
              name: sealed.name,
              roles: sealed.roles,
              ...(sealed.partnerId !== undefined ? { partnerId: sealed.partnerId } : {}),
              ...(sealed.partnerSlug !== undefined ? { partnerSlug: sealed.partnerSlug } : {}),
              ...(sealed.partnerKey !== undefined ? { partnerKey: sealed.partnerKey } : {}),
            };
            authStore.setUser(user);
            writeSessionTransferState(transferState, user);
          }
        }
      } catch {
        // Sin sesión válida en SSR: el cliente arranca anónimo (comportamiento previo).
      }
    }),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
