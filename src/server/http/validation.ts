import { normalizeSlug } from '../../app/core/tenant/slug.ts';

export type SlugParamValidationResult = { ok: true; slug: string } | { ok: false };

/** Valida el `:slug` de una ruta pública/journey (solo formato — sin chequeo de reservados, FR-019). */
export function validateSlugParam(raw: string): SlugParamValidationResult {
  const normalized = normalizeSlug(raw);
  return normalized ? { ok: true, slug: normalized } : { ok: false };
}

/** Valida que el body parseado sea un objeto plano (no array, no null) antes de leer campos. */
export function isPlainObjectBody(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body);
}
