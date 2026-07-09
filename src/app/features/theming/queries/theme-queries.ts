import { Injectable, inject } from '@angular/core';
import { queryOptions } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import type { PublicTheme } from '../../../../shared/partner/public-theme-model';
import { ThemeApiService } from '../services/theme-api';

/**
 * Caché de servidor del theme, keyeada por `version` (cache-busting, FR-013):
 * publicar un cambio incrementa `version` ⇒ nueva `queryKey` ⇒ la próxima
 * visita resuelve el nuevo theme sin redeploy (FR-012). La invalidación
 * explícita (`invalidateQueries(['theme', slug])`) al publicar y el
 * `Cache-Control`/CDN server-side son PRD 04/05 — frontera documentada, no
 * ambigua (contracts/theme-transfer.contract.md §4).
 */
@Injectable({ providedIn: 'root' })
export class ThemeQueries {
  private readonly themeApi = inject(ThemeApiService);

  bySlug(slug: string, version: number, initialData: PublicTheme) {
    return queryOptions({
      queryKey: ['theme', slug, version] as const,
      queryFn: () => firstValueFrom(this.themeApi.getTheme(slug)),
      initialData,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    });
  }
}
