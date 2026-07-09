import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMasheryClient } from './mashery-client.ts';

test('mashery-client resiliencia', async (t) => {
  await t.test('P1: reintenta ante fallo de red y termina resolviendo si Mashery se recupera', async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      if (calls < 2) {
        throw new Error('ECONNRESET');
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const client = createMasheryClient({ maxRetries: 2, breakerThreshold: 10 });
      const result = await client.call({ slug: 'p1', baseUrl: 'http://x', apiKey: 'k', action: 'quote', payload: {} });
      assert.equal(result.ok, true);
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('P2: agota reintentos y falla; el breaker abre tras N fallos → llamadas siguientes fallan inmediato', async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    try {
      const client = createMasheryClient({ maxRetries: 0, breakerThreshold: 2, breakerCooldownMs: 60_000 });
      const input = { slug: 'p2', baseUrl: 'http://x', apiKey: 'k', action: 'quote', payload: {} };

      await assert.rejects(() => client.call(input));
      await assert.rejects(() => client.call(input));
      const callsBeforeOpen = calls;

      await assert.rejects(() => client.call(input));
      assert.equal(calls, callsBeforeOpen, 'con el breaker abierto no debe golpear la red de nuevo');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('P3: el timeout acota la request (no cuelga indefinidamente)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
      });
    }) as typeof fetch;

    // AbortSignal.timeout usa un temporizador unref'd — mantiene el event loop
    // vivo con un keepalive propio del test para no cortar antes de que dispare.
    const keepAlive = setInterval(() => {}, 5);

    try {
      const client = createMasheryClient({ timeoutMs: 20, maxRetries: 0, breakerThreshold: 10 });
      const start = Date.now();
      await assert.rejects(() =>
        client.call({ slug: 'p3', baseUrl: 'http://x', apiKey: 'k', action: 'quote', payload: {} }),
      );
      assert.ok(Date.now() - start < 2000, 'no debe colgar indefinidamente');
    } finally {
      clearInterval(keepAlive);
      globalThis.fetch = originalFetch;
    }
  });
});
