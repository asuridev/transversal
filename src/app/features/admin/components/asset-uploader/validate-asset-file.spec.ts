import { MAX_SIZE_BYTES, validateAssetFile } from './validate-asset-file';

function fileOfType(type: string, size = 10): File {
  const f = new File([new Uint8Array(1)], 'x', { type });
  // `File.size` es de solo lectura; se sobreescribe para probar el límite sin
  // materializar 2 MB de bytes.
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateAssetFile', () => {
  it('acepta un PNG dentro del límite', () => {
    expect(validateAssetFile(fileOfType('image/png'))).toEqual({ ok: true });
  });

  it('acepta los demás MIME permitidos (jpeg, svg, ico, webp)', () => {
    for (const type of ['image/jpeg', 'image/svg+xml', 'image/x-icon', 'image/webp']) {
      expect(validateAssetFile(fileOfType(type)).ok).toBe(true);
    }
  });

  it('rechaza un MIME no permitido', () => {
    const result = validateAssetFile(fileOfType('application/pdf'));
    expect(result).toEqual({ ok: false, error: 'Tipo de archivo no permitido.' });
  });

  it('rechaza un archivo que supera el tamaño máximo', () => {
    const result = validateAssetFile(fileOfType('image/png', MAX_SIZE_BYTES + 1));
    expect(result.ok).toBe(false);
  });

  it('acepta un archivo exactamente en el límite', () => {
    expect(validateAssetFile(fileOfType('image/png', MAX_SIZE_BYTES)).ok).toBe(true);
  });
});
