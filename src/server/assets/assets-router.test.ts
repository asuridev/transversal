import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { createAssetsRouter } from './assets-router.ts';
import { createInMemoryAssetStorage } from './asset-storage.ts';

async function startServer() {
  const assetStorage = createInMemoryAssetStorage();
  await assetStorage.put({ key: 'p-logo.png', mimeType: 'image/png', bytes: Buffer.from('png-bytes') });

  const app = express();
  app.use('/assets', createAssetsRouter(assetStorage));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/assets`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('GET /assets/:key', async (t) => {
  await t.test('sirve los bytes con Cache-Control: no-cache (key estable ⇒ revalidar)', async () => {
    const { baseUrl, close } = await startServer();
    try {
      const res = await fetch(`${baseUrl}/p-logo.png`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      // Nombre estable por partner+slot: no puede ser `immutable` o se serviría lo viejo.
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(await res.text(), 'png-bytes');
    } finally {
      await close();
    }
  });

  await t.test('key inexistente ⇒ 404', async () => {
    const { baseUrl, close } = await startServer();
    try {
      assert.equal((await fetch(`${baseUrl}/missing.png`)).status, 404);
    } finally {
      await close();
    }
  });
});
