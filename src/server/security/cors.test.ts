import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { createCorsMiddleware } from './cors.ts';

async function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(createCorsMiddleware({ allowedOrigins: ['https://login.partner.example'] }));
  app.get('/theme/:slug', (_req, res) => res.status(200).json({ ok: true }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('createCorsMiddleware', async (t) => {
  await t.test('CT-20: origen permitido ⇒ Access-Control-Allow-Origin + Vary', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, {
        headers: { Origin: 'https://login.partner.example' },
      });
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://login.partner.example');
      assert.equal(res.headers.get('vary'), 'Origin');
    });
  });

  await t.test('CT-21: preflight OPTIONS con origen permitido ⇒ 204 con Allow-Methods/Allow-Headers', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://login.partner.example' },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
      assert.equal(res.headers.get('access-control-allow-headers'), 'If-None-Match');
    });
  });

  await t.test('CT-22: origen no permitido ⇒ sin cabeceras CORS', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, {
        headers: { Origin: 'https://evil.example.com' },
      });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  await t.test('CT-25: nunca Access-Control-Allow-Credentials', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, {
        headers: { Origin: 'https://login.partner.example' },
      });
      assert.equal(res.headers.get('access-control-allow-credentials'), null);
    });
  });
});
