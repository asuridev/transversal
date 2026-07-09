import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateBrandAsset } from './asset-validation.ts';

describe('validateBrandAsset', () => {
  it('acepta un logo válido (MIME, tamaño y dimensiones dentro de rango)', () => {
    const result = validateBrandAsset({ mimeType: 'image/svg+xml', sizeBytes: 10_000, width: 200, height: 200 });
    assert.deepEqual(result, { ok: true });
  });

  it('rechaza un MIME no permitido', () => {
    const result = validateBrandAsset({ mimeType: 'application/pdf', sizeBytes: 10_000 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'invalid-mime');
  });

  it('rechaza un archivo que excede el tamaño máximo', () => {
    const result = validateBrandAsset({ mimeType: 'image/png', sizeBytes: 5 * 1024 * 1024 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'too-large');
  });

  it('rechaza dimensiones fuera de rango', () => {
    const result = validateBrandAsset({ mimeType: 'image/png', sizeBytes: 1000, width: 10_000, height: 10_000 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'invalid-dimensions');
  });
});
