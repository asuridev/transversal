import { normalizeSlug } from '../../app/core/tenant/slug.ts';
import { isReservedSegment } from '../../app/core/tenant/reserved-names.ts';
import type { ReservedArea } from '../../app/core/tenant/tenant-resolution-model.ts';

export type SlugValidationError =
  | { kind: 'invalid-format' }
  | { kind: 'reserved'; area: ReservedArea };

export type SlugValidationResult =
  | { ok: true; slug: string }
  | { ok: false; error: SlugValidationError };

/**
 * Valida el slug de un alta ANTES de invocar el puerto (formato + no reservado).
 * Reutiliza el kernel de la feature 001 — misma fuente de verdad que el guard
 * de ruteo (`normalizeSlug`, `isReservedSegment`).
 */
export function validateNewPartnerSlug(raw: string): SlugValidationResult {
  const normalized = normalizeSlug(raw);
  if (!normalized) {
    return { ok: false, error: { kind: 'invalid-format' } };
  }

  const reservedArea = isReservedSegment(normalized);
  if (reservedArea) {
    return { ok: false, error: { kind: 'reserved', area: reservedArea } };
  }

  return { ok: true, slug: normalized };
}
