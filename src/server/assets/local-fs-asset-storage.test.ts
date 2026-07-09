import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLocalFsAssetStorage } from './local-fs-asset-storage.ts';

describe('createLocalFsAssetStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'assets-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('put → get devuelve los mismos bytes y el mimeType derivado de la extensión', async () => {
    const storage = createLocalFsAssetStorage(dir);
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const ref = await storage.put({ key: 'logo.png', mimeType: 'image/png', bytes });
    assert.deepEqual(ref, { url: '/assets/logo.png', key: 'logo.png' });

    const asset = await storage.get('logo.png');
    assert.ok(asset);
    assert.deepEqual([...asset.bytes], [1, 2, 3, 4]);
    assert.equal(asset.mimeType, 'image/png');
  });

  it('deriva el mimeType correcto para svg', async () => {
    const storage = createLocalFsAssetStorage(dir);
    await storage.put({ key: 'brand.svg', mimeType: 'image/svg+xml', bytes: new Uint8Array([60]) });

    const asset = await storage.get('brand.svg');
    assert.equal(asset?.mimeType, 'image/svg+xml');
  });

  it('get de una key inexistente devuelve null', async () => {
    const storage = createLocalFsAssetStorage(dir);
    assert.equal(await storage.get('nope.png'), null);
  });

  it('get de una key sin extensión conocida devuelve null', async () => {
    const storage = createLocalFsAssetStorage(dir);
    assert.equal(await storage.get('archivo.exe'), null);
  });

  it('rechaza path traversal en put', async () => {
    const storage = createLocalFsAssetStorage(dir);
    await assert.rejects(
      () => storage.put({ key: '../escape.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }),
      /path traversal/,
    );
  });

  it('get con path traversal devuelve null (no escapa del dir)', async () => {
    const storage = createLocalFsAssetStorage(dir);
    assert.equal(await storage.get('../../etc/passwd.png'), null);
  });
});
