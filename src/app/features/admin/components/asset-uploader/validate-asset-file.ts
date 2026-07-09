/** Tipos MIME de imagen aceptados en cliente (el BFF revalida y es autoritativo, FR-009). */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/x-icon',
  'image/webp',
]);

/** Tamaño máximo — feedback temprano; el BFF revalida (FR-009). */
export const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export type AssetFileValidation = { ok: true } | { ok: false; error: string };

/**
 * Validación cliente (MIME/tamaño) de un asset antes de subir — función pura y
 * testeable. Es solo feedback temprano: el BFF revalida y sanitiza SVG
 * server-side (autoritativo).
 */
export function validateAssetFile(file: File): AssetFileValidation {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: 'Tipo de archivo no permitido.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: 'El archivo supera el tamaño máximo permitido (2 MB).' };
  }
  return { ok: true };
}
