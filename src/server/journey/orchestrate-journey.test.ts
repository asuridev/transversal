import { test } from 'node:test';
import assert from 'node:assert/strict';

import { orchestrateJourney } from './orchestrate-journey.ts';
import type { SecretResolver, IntegrationCreds } from '../secrets/secret-resolver.ts';
import type { MasheryClient } from './mashery-client.ts';

function fakeSecretResolver(creds: Record<string, IntegrationCreds | null>): SecretResolver {
  return {
    async resolve(slug: string) {
      return creds[slug] ?? null;
    },
    invalidate() {},
    async isConfigured(slug: string) {
      return (creds[slug] ?? null) !== null;
    },
  };
}

test('orchestrateJourney', async (t) => {
  await t.test('P1: la llamada saliente usa baseUrl+apiKey del partner correcto', async () => {
    const calls: Array<{ baseUrl: string; apiKey: string }> = [];
    const masheryClient: MasheryClient = {
      async call(input) {
        calls.push({ baseUrl: input.baseUrl, apiKey: input.apiKey });
        return { ok: true, status: 200, body: { result: 'quoted' } };
      },
    };
    const secretResolver = fakeSecretResolver({
      'banco-popular': { baseUrl: 'http://mashery.local', apiKey: 'key-a' },
    });

    const result = await orchestrateJourney(
      { slug: 'banco-popular', action: 'quote', payload: {} },
      { secretResolver, masheryClient },
    );

    assert.equal(result.kind, 'ok');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { baseUrl: 'http://mashery.local', apiKey: 'key-a' });
  });

  await t.test('P2: dos partners comparten el mismo Mashery pero no mezclan apiKey', async () => {
    const calls: Array<{ baseUrl: string; apiKey: string }> = [];
    const masheryClient: MasheryClient = {
      async call(input) {
        calls.push({ baseUrl: input.baseUrl, apiKey: input.apiKey });
        return { ok: true, status: 200, body: {} };
      },
    };
    const secretResolver = fakeSecretResolver({
      'banco-popular': { baseUrl: 'http://mashery.local', apiKey: 'key-a' },
      occidente: { baseUrl: 'http://mashery.local', apiKey: 'key-b' },
    });

    await orchestrateJourney({ slug: 'banco-popular', action: 'quote', payload: {} }, { secretResolver, masheryClient });
    await orchestrateJourney({ slug: 'occidente', action: 'quote', payload: {} }, { secretResolver, masheryClient });

    assert.deepEqual(calls[0], { baseUrl: 'http://mashery.local', apiKey: 'key-a' });
    assert.deepEqual(calls[1], { baseUrl: 'http://mashery.local', apiKey: 'key-b' });
  });

  await t.test('P3: resolve()===null → mashery_unavailable sin usar creds de otro partner', async () => {
    const masheryClient: MasheryClient = {
      async call() {
        throw new Error('no debería invocarse Mashery sin creds');
      },
    };
    const secretResolver = fakeSecretResolver({});

    const result = await orchestrateJourney(
      { slug: 'sin-integracion', action: 'quote', payload: {} },
      { secretResolver, masheryClient },
    );

    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.equal(result.error.code, 'mashery_unavailable');
    }
  });

  await t.test('P4: la respuesta y el orquestador no contienen el apiKey', async () => {
    const masheryClient: MasheryClient = {
      async call() {
        return { ok: true, status: 200, body: { echoed: 'ok' } };
      },
    };
    const secretResolver = fakeSecretResolver({
      'banco-popular': { baseUrl: 'http://mashery/a', apiKey: 'top-secret' },
    });

    const result = await orchestrateJourney(
      { slug: 'banco-popular', action: 'quote', payload: {} },
      { secretResolver, masheryClient },
    );

    assert.ok(!JSON.stringify(result).includes('top-secret'));
  });

  await t.test('P5: Mashery responde error → ApiError uniforme sin detalle interno (normalizeMasheryError)', async () => {
    const masheryClient: MasheryClient = {
      async call() {
        return { ok: false, status: 500, body: { message: 'stacktrace at /internal/endpoint' } };
      },
    };
    const secretResolver = fakeSecretResolver({
      'banco-popular': { baseUrl: 'http://mashery/a', apiKey: 'key-a' },
    });

    const result = await orchestrateJourney(
      { slug: 'banco-popular', action: 'quote', payload: {} },
      { secretResolver, masheryClient },
    );

    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.equal(result.error.code, 'mashery_error');
      assert.ok(!result.error.message.includes('/internal/endpoint'));
    }
  });

  await t.test('P6: un fallo de red/timeout de Mashery → mashery_unavailable, sin colgar', async () => {
    const masheryClient: MasheryClient = {
      async call() {
        const err = new Error('AbortError: timeout');
        err.name = 'AbortError';
        throw err;
      },
    };
    const secretResolver = fakeSecretResolver({
      'banco-popular': { baseUrl: 'http://mashery/a', apiKey: 'key-a' },
    });

    const result = await orchestrateJourney(
      { slug: 'banco-popular', action: 'quote', payload: {} },
      { secretResolver, masheryClient },
    );

    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.equal(result.error.code, 'mashery_unavailable');
    }
  });
});
