import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import type { PublicTheme } from '../../../shared/partner/public-theme-model';
import { getDefaultPublicTheme } from '../../../shared/partner/default-public-theme';
import { toCssVars } from '../theme/theme-css-vars';

const DEFAULT_PARTNER_SLUG = '__default__';

interface ThemeState {
  theme: PublicTheme | null;
}

const initialState: ThemeState = {
  theme: null,
};

/** Theme activo (síncrono) — no cachea datos de API (Constitución I, data-model §2). */
export const ThemeStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ theme }) => ({
    isBranded: computed(() => theme() !== null && theme()!.slug !== DEFAULT_PARTNER_SLUG),
    cssVars: computed(() => toCssVars(theme())),
  })),
  withMethods((store) => ({
    apply(theme: PublicTheme): void {
      patchState(store, { theme });
    },
    reset(): void {
      patchState(store, { theme: getDefaultPublicTheme() });
    },
  })),
);
