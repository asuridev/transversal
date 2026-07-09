import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import type { AppRole, AuthUser } from './auth-model';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
}

const initialState: AuthState = {
  user: null,
};

/**
 * Sesión (síncrona) consumida por `authGuard`/`roleGuard` (D6/D10). Poblada
 * en el `onSuccess` de `AuthQueries.session()` (bootstrap por TanStack Query,
 * Const. I) — nunca guarda datos de servidor cacheables.
 */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ user }) => ({
    isAuthenticated: computed(() => user() !== null),
    partnerId: computed(() => user()?.partnerId ?? null),
    partnerSlug: computed(() => user()?.partnerSlug ?? null),
    partnerKey: computed(() => user()?.partnerKey ?? null),
    isAsesor: computed(() => user()?.partnerSlug !== undefined),
  })),
  withMethods((store) => ({
    setUser(user: AuthUser | null): void {
      patchState(store, { user });
    },
    clear(): void {
      patchState(store, { user: null });
    },
    hasAnyRole(...roles: AppRole[]): boolean {
      const current = store.user();
      return current !== null && roles.some((role) => current.roles.includes(role));
    },
  })),
);
