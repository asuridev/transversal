import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { PartnersQueries } from '../../features/partners/queries/partners-queries';
import { TenantStore } from '../store/tenant.store';
import { resolveTenant } from './resolve-tenant';

function pathnameFromSegments(segments: ReadonlyArray<{ path: string }>): string {
  return '/' + segments.map((segment) => segment.path).join('/');
}

export const tenantMatch: CanMatchFn = async (_route, segments) => {
  const queryClient = inject(QueryClient);
  const partnersQueries = inject(PartnersQueries);
  const tenantStore = inject(TenantStore);

  const pathname = pathnameFromSegments(segments);

  let activeSlugs: ReadonlySet<string>;
  try {
    activeSlugs = await queryClient.ensureQueryData(partnersQueries.activePartners());
  } catch {
    tenantStore.setResolution({ kind: 'fallback', reason: 'unknown-slug' });
    return false;
  }

  const resolution = resolveTenant({ pathname }, activeSlugs);
  tenantStore.setResolution(resolution);
  return resolution.kind === 'partner';
};
