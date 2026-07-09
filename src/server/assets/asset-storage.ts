import { createLocalFsAssetStorage } from './local-fs-asset-storage.ts';

export interface StoredAssetRef {
  readonly url: string;
  readonly key: string;
}

/** Binario recuperado del storage para servirlo en `/assets/:key`. */
export interface StoredAsset {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface AssetStorage {
  /** Sube un binario ya validado y devuelve su referencia pública. Sin exponer creds del storage. */
  put(input: { key: string; mimeType: string; bytes: Uint8Array }): Promise<StoredAssetRef>;
  /** Lee un asset por key para servirlo en `/assets/:key`. `null` si no existe. */
  get(key: string): Promise<StoredAsset | null>;
  /** Alternativa: URL firmada para subida directa acotada (sin creds al cliente). */
  createSignedUploadUrl?(input: { key: string; mimeType: string }): Promise<{ uploadUrl: string; ref: StoredAssetRef }>;
}

export type AssetStorageDriver = 'local' | 'cloud';

/**
 * Selecciona el backend de assets por driver, igual que `createPartnerRepository`
 * (persistence-config): `local` (filesystem) hoy; `cloud` (bucket/CDN) en hito M2.
 *
 * El contrato de URL es estable: cualquier backend devuelve `/assets/<key>` en
 * `StoredAssetRef.url`. La migración a nube toca SOLO el adaptador — el handler de
 * `/assets/*` seguirá llamando a `get()` (que devolverá bytes) o hará `302` a la URL
 * pública/CDN del objeto. Las URLs `/assets/<key>` ya guardadas en los themes no
 * cambian, así que migrar no reescribe datos.
 */
export function createAssetStorage(
  driver: AssetStorageDriver = (process.env['ASSET_STORAGE_DRIVER'] as AssetStorageDriver) ?? 'local',
  location = process.env['ASSETS_DIR'] ?? './data/assets',
): AssetStorage {
  switch (driver) {
    case 'local':
      return createLocalFsAssetStorage(location);
    case 'cloud':
      throw new Error('cloud asset storage adapter: hito M2 (fuera de esta feature)');
  }
}

/** Adaptador in-memory, solo para tests herméticos (sin I/O de disco). */
export function createInMemoryAssetStorage(): AssetStorage {
  const store = new Map<string, StoredAsset>();

  return {
    async put(input): Promise<StoredAssetRef> {
      store.set(input.key, { bytes: input.bytes, mimeType: input.mimeType });
      return { url: `/assets/${input.key}`, key: input.key };
    },
    async get(key): Promise<StoredAsset | null> {
      return store.get(key) ?? null;
    },
  };
}
