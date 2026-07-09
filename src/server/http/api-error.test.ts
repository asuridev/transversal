import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMasheryError, createApiError, httpStatusForCode } from './api-error.ts';

test('normalizeMasheryError', async (t) => {
  await t.test('P1: no-credentials → mashery_unavailable, sin detalle interno', () => {
    const error = normalizeMasheryError({ kind: 'no-credentials' }, 'req-1');
    assert.equal(error.code, 'mashery_unavailable');
    assert.equal(error.requestId, 'req-1');
    assert.ok(!error.message.includes('PARTNER_'));
  });

  await t.test('P2: http-error (p. ej. 500 con endpoint interno en el cuerpo) → mashery_error sin filtrar el cuerpo crudo', () => {
    const error = normalizeMasheryError({ kind: 'http-error', status: 500 }, 'req-2');
    assert.equal(error.code, 'mashery_error');
    assert.ok(!error.message.includes('/internal/'));
    assert.ok(!JSON.stringify(error).includes('/internal/'));
  });

  await t.test('P3: network-error (timeout/abort) → mashery_unavailable, sin stack ni mensaje crudo', () => {
    const rawError = new Error('AbortError: connect ECONNREFUSED 10.0.0.5:9999 /internal/mashery-endpoint');
    const error = normalizeMasheryError({ kind: 'network-error', error: rawError }, 'req-3');
    assert.equal(error.code, 'mashery_unavailable');
    assert.ok(!JSON.stringify(error).includes('10.0.0.5'));
    assert.ok(!JSON.stringify(error).includes('/internal/mashery-endpoint'));
  });

  await t.test('P4: todo ApiError emitido lleva un requestId no vacío', () => {
    for (const failure of [
      { kind: 'no-credentials' as const },
      { kind: 'http-error' as const, status: 502 },
      { kind: 'network-error' as const, error: new Error('x') },
    ]) {
      const error = normalizeMasheryError(failure, 'req-4');
      assert.ok(error.requestId.length > 0);
    }
  });
});

test('createApiError / httpStatusForCode', async (t) => {
  await t.test('P1: invalid_input detalla el campo, no el valor sensible', () => {
    const error = createApiError('invalid_input', 'Slug inválido', 'req-5', { field: 'slug' });
    assert.equal(httpStatusForCode(error.code), 400);
    assert.deepEqual(error.details, { field: 'slug' });
  });

  await t.test('P2: mapa código→HTTP cubre todos los códigos del contrato', () => {
    assert.equal(httpStatusForCode('unauthorized'), 401);
    assert.equal(httpStatusForCode('not_found'), 404);
    assert.equal(httpStatusForCode('rate_limited'), 429);
    assert.equal(httpStatusForCode('mashery_unavailable'), 502);
    assert.equal(httpStatusForCode('mashery_error'), 502);
    assert.equal(httpStatusForCode('internal'), 500);
  });
});
