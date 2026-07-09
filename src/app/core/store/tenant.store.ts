import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { TenantResolution } from '../tenant/tenant-resolution-model';

interface TenantState {
  resolution: TenantResolution | null;
}

const initialState: TenantState = {
  resolution: null,
};

export const TenantStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ resolution }) => ({
    partnerSlug: computed(() => {
      const current = resolution();
      return current?.kind === 'partner' ? current.slug : null;
    }),
    isPartner: computed(() => resolution()?.kind === 'partner'),
    isFallback: computed(() => resolution()?.kind === 'fallback'),
  })),
  withMethods((store) => ({
    setResolution(resolution: TenantResolution): void {
      patchState(store, { resolution });
    },
  })),
);
