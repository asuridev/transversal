export interface AssetValidationInput {
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export type AssetValidationError =
  | { kind: 'invalid-mime'; mimeType: string }
  | { kind: 'too-large'; sizeBytes: number; maxBytes: number }
  | { kind: 'invalid-dimensions'; width: number; height: number };

export type AssetValidationResult = { ok: true } | { ok: false; error: AssetValidationError };

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/svg+xml',
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'font/woff2',
]);

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_DIMENSION_PX = 4096;

/** Reglas de validación de binarios de marca (FR-016): MIME, tamaño, dimensiones. */
export function validateBrandAsset(input: AssetValidationInput): AssetValidationResult {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, error: { kind: 'invalid-mime', mimeType: input.mimeType } };
  }

  if (input.sizeBytes > MAX_SIZE_BYTES) {
    return { ok: false, error: { kind: 'too-large', sizeBytes: input.sizeBytes, maxBytes: MAX_SIZE_BYTES } };
  }

  if (input.width !== undefined && input.height !== undefined) {
    const invalidDimensions =
      input.width <= 0 || input.height <= 0 || input.width > MAX_DIMENSION_PX || input.height > MAX_DIMENSION_PX;
    if (invalidDimensions) {
      return { ok: false, error: { kind: 'invalid-dimensions', width: input.width, height: input.height } };
    }
  }

  return { ok: true };
}
