import { toPublicTheme } from '../../../shared/partner/theme-projection.ts';
import { getDefaultPublicTheme } from '../../../shared/partner/default-public-theme.ts';
import type { PublicTheme } from '../../../shared/partner/public-theme-model.ts';
import type { PartnerRepository } from '../../../server/persistence/partner-repository.ts';
import type { TenantResolution } from '../tenant/tenant-resolution-model.ts';

/**
 * Resuelve el `PublicTheme` a pintar en SSR a partir de la `TenantResolution`
 * (feature `001`), consultando el `PartnerRepository` in-process (feature `002`,
 * sin HTTP — D3). Cae al theme default indistinguible para cualquier motivo
 * que no sea `kind: 'partner'` con theme publicado (FR-016, SC-006).
 */
export async function resolveActiveTheme(
  resolution: TenantResolution,
  repository: PartnerRepository,
): Promise<PublicTheme> {
  if (resolution.kind === 'partner') {
    const theme = await repository.getPublishedTheme(resolution.slug);
    if (theme) {
      const partner = await repository.findBySlug(resolution.slug);
      if (partner) {
        return toPublicTheme(theme, partner);
      }
    }
  }

  return getDefaultPublicTheme();
}
