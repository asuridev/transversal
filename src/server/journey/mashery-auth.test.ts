import { test } from 'node:test';
import assert from 'node:assert/strict';

import { acquireApiTokens } from './mashery-auth.ts';

const config = { authBaseUrl: 'http://auth.local', timeoutMs: 1000 };

function stub(handlers: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return handlers(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

test('mashery-auth: acquireApiTokens', async (t) => {
  await t.test('encadena paso 2 (paramj) y paso 3 (tokens) con _p + correlation-id', async () => {
    const original = globalThis.fetch;
    const { impl, calls } = stub((url) => {
      if (url.includes('/v1/params/__j')) {
        return new Response(JSON.stringify({ bodyResponse: { paramj: 'pj-1' } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          bodyResponse: [
            { name_api: 'AuthorizationCustomer', access_token: 'ac-tok' },
            { name_api: 'AuthReferencials', access_token: 'ref-tok' },
          ],
        }),
        { status: 200 },
      );
    });
    globalThis.fetch = impl;
    try {
      const tokens = await acquireApiTokens(config, { partnerKey: 'pk', correlationId: 'cid' });
      assert.equal(tokens.paramj, 'pj-1');
      assert.equal(tokens.tokenFor('AuthorizationCustomer'), 'ac-tok');
      assert.equal(tokens.tokenFor('AuthReferencials'), 'ref-tok');
      assert.equal(tokens.tokenFor('NoExiste'), null);
    } finally {
      globalThis.fetch = original;
    }

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/v1\/params\/__j$/);
    assert.equal(calls[0].headers['_p'], 'pk');
    assert.equal(calls[0].headers['correlation-id'], 'cid');
    assert.match(calls[1].url, /\/v2\/tokenRequest\/jwt\?api=CU,REF,DS,SEC$/);
    assert.equal(calls[1].headers['__j'], 'pj-1');
  });

  await t.test('respeta las apis provistas en el input', async () => {
    const original = globalThis.fetch;
    const { impl, calls } = stub((url) =>
      url.includes('/v1/params/__j')
        ? new Response(JSON.stringify({ bodyResponse: { paramj: 'pj' } }), { status: 200 })
        : new Response(JSON.stringify({ bodyResponse: [] }), { status: 200 }),
    );
    globalThis.fetch = impl;
    try {
      await acquireApiTokens(config, { partnerKey: 'pk', correlationId: 'cid', apis: ['CU'] });
    } finally {
      globalThis.fetch = original;
    }
    assert.match(calls[1].url, /\?api=CU$/);
  });

  await t.test('paso 2 sin paramj ⇒ lanza', async () => {
    const original = globalThis.fetch;
    const { impl } = stub(() => new Response(JSON.stringify({ bodyResponse: {} }), { status: 200 }));
    globalThis.fetch = impl;
    try {
      await assert.rejects(acquireApiTokens(config, { partnerKey: 'pk', correlationId: 'cid' }), /sin paramj/);
    } finally {
      globalThis.fetch = original;
    }
  });

  await t.test('paso 2 con status != 2xx ⇒ lanza', async () => {
    const original = globalThis.fetch;
    const { impl } = stub(() => new Response('boom', { status: 500 }));
    globalThis.fetch = impl;
    try {
      await assert.rejects(acquireApiTokens(config, { partnerKey: 'pk', correlationId: 'cid' }), /respondió 500/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
