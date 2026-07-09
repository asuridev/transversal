import { isReservedSegment } from './reserved-names';
import { normalizeSlug } from './slug';
import { TenantInput, TenantResolution } from './tenant-resolution-model';

function firstSegment(pathname: string): string | null {
  const withoutQueryOrHash = pathname.split(/[?#]/)[0];
  const segment = withoutQueryOrHash.split('/').find((part) => part.length > 0);
  return segment ?? null;
}

export function resolveTenant(
  input: TenantInput,
  activeSlugs: ReadonlySet<string>,
): TenantResolution {
  const rawSegment = firstSegment(input.pathname);

  if (rawSegment === null) {
    return { kind: 'root' };
  }

  const reservedArea = isReservedSegment(rawSegment);
  if (reservedArea !== null) {
    return { kind: 'reserved', area: reservedArea };
  }

  const slug = normalizeSlug(rawSegment);
  if (slug === null) {
    return { kind: 'fallback', reason: 'unknown-slug' };
  }

  if (activeSlugs.has(slug)) {
    return { kind: 'partner', slug };
  }

  return { kind: 'fallback', reason: 'unknown-slug' };
}
