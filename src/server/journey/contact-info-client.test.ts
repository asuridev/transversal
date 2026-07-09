import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchContactInfo } from './contact-info-client.ts';

const config = { customerBaseUrl: 'http://customer.local', timeoutMs: 1000 };

const input = {
  partnerKey: 'pk',
  correlationId: 'cid',
  paramj: 'pj',
  accessToken: 'ac-tok',
  documentType: 'CC',
  documentNumber: '10282664',
};

test('contact-info-client: fetchContactInfo', async (t) => {
  await t.test('arma URL con query + headers (__j, _p, correlation-id, Bearer) y devuelve el body', async () => {
    const original = globalThis.fetch;
    let captured: { url: string; headers: Record<string, string> } | null = null;
    globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(u), headers: (init?.headers ?? {}) as Record<string, string> };
      return new Response(JSON.stringify({ responseHeader: { returnCode: 200 } }), { status: 200 });
    }) as typeof fetch;
    try {
      const body = (await fetchContactInfo(config, input)) as { responseHeader: { returnCode: number } };
      assert.equal(body.responseHeader.returnCode, 200);
    } finally {
      globalThis.fetch = original;
    }

    assert.ok(captured);
    assert.match(captured!.url, /\/customer\/v1\/external\/contact_info\?/);
    assert.match(captured!.url, /customerDocumentType=CC/);
    assert.match(captured!.url, /customerDocumentNumber=10282664/);
    assert.equal(captured!.headers['__j'], 'pj');
    assert.equal(captured!.headers['_p'], 'pk');
    assert.equal(captured!.headers['correlation-id'], 'cid');
    assert.equal(captured!.headers['authorization'], 'Bearer ac-tok');
  });

  await t.test('status != 2xx ⇒ lanza', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('nope', { status: 403 })) as typeof fetch;
    try {
      await assert.rejects(fetchContactInfo(config, input), /respondió 403/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
