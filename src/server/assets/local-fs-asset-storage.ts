import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import type { AssetStorage, StoredAsset, StoredAssetRef } from './asset-storage.ts';

/** MIME ↔ extensión de los binarios de marca permitidos (ver `validateBrandAsset`). */
const MIME_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['svg', 'image/svg+xml'],
  ['ico', 'image/x-icon'],
  ['webp', 'image/webp'],
  ['woff2', 'font/woff2'],
]);

function mimeForKey(key: string): string | null {
  const dot = key.lastIndexOf('.');
  if (dot < 0) return null;
  return MIME_BY_EXTENSION.get(key.slice(dot + 1).toLowerCase()) ?? null;
}

/**
 * Almacena los assets de marca en el filesystem del servidor (`dir`), persistiendo
 * entre reinicios. Es el backend V1 detrás del seam `AssetStorage`; migrar a un bucket
 * de nube solo cambia el adaptador, no el contrato `/assets/<key>` (ver `createAssetStorage`).
 *
 * Nada de I/O a nivel de módulo (ARCHITECTURE §11): el `mkdir` es perezoso, dentro de `put`.
 */
export function createLocalFsAssetStorage(dir: string): AssetStorage {
  const root = resolve(dir);

  /** Resuelve `key` dentro de `root` y rechaza escapes (path traversal). */
  function safePath(key: string): string | null {
    const target = resolve(root, key);
    if (target !== root && !target.startsWith(root + sep)) {
      return null;
    }
    return target;
  }

  return {
    async put(input): Promise<StoredAssetRef> {
      const target = safePath(input.key);
      if (target === null) {
        throw new Error(`asset key inválido (path traversal): ${input.key}`);
      }
      await mkdir(root, { recursive: true });
      await writeFile(target, input.bytes);
      return { url: `/assets/${input.key}`, key: input.key };
    },

    async get(key): Promise<StoredAsset | null> {
      const target = safePath(key);
      if (target === null) return null;

      const mimeType = mimeForKey(key);
      if (mimeType === null) return null;

      try {
        const bytes = await readFile(target);
        return { bytes, mimeType };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
  };
}
