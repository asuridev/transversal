import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { createSessionSeal, type SealedSession } from './session-seal.ts';

const key = randomBytes(32).toString('base64');

function payload(overrides: Partial<SealedSession> = {}): SealedSession {
  const iat = Math.floor(Date.now() / 1000);
  return {
    sub: 'u-123',
    name: 'Ana Pérez',
    roles: ['partner-editor'],
    iat,
    exp: iat + 3600,
    ...overrides,
  };
}

test('session-seal', async (t) => {
  await t.test('P1: sellar/desellar redondea el mismo payload', () => {
    const { seal, unseal } = createSessionSeal({ key });
    const original = payload();
    const raw = seal(original);
    const result = unseal(raw);
    assert.deepEqual(result, original);
  });

  await t.test('P2: exp vencido ⇒ inválida (null)', () => {
    const { seal, unseal } = createSessionSeal({ key, now: () => Date.now() + 4_000_000 });
    const raw = seal(payload());
    assert.equal(unseal(raw), null);
  });

  await t.test('P3: payload manipulado ⇒ inválida (null)', () => {
    const { seal, unseal } = createSessionSeal({ key });
    const raw = seal(payload());
    const tampered = raw.slice(0, -2) + (raw.at(-2) === 'A' ? 'B' : 'A') + raw.at(-1);
    assert.equal(unseal(tampered), null);
  });

  await t.test('P4: raw vacío/inválido ⇒ null sin lanzar', () => {
    const { unseal } = createSessionSeal({ key });
    assert.equal(unseal(''), null);
    assert.equal(unseal('not-a-valid-token'), null);
  });

  await t.test('P5: sellado con una key no desella con otra key', () => {
    const other = randomBytes(32).toString('base64');
    const { seal } = createSessionSeal({ key });
    const { unseal } = createSessionSeal({ key: other });
    const raw = seal(payload());
    assert.equal(unseal(raw), null);
  });

  await t.test('P6: round-trip CON partner (sesión de asesor, 007/D2)', () => {
    const { seal, unseal } = createSessionSeal({ key });
    const original = payload({ partnerId: 'p-abc', partnerSlug: 'banco-a' });
    const raw = seal(original);
    assert.deepEqual(unseal(raw), original);
  });

  await t.test('P7: round-trip SIN partner (sesión de admin, campos opcionales ausentes)', () => {
    const { seal, unseal } = createSessionSeal({ key });
    const original = payload();
    const raw = seal(original);
    const result = unseal(raw);
    assert.equal(result?.partnerId, undefined);
    assert.equal(result?.partnerSlug, undefined);
  });

  await t.test('P8: payload con partner manipulado ⇒ inválida (null)', () => {
    const { seal, unseal } = createSessionSeal({ key });
    const raw = seal(payload({ partnerId: 'p-abc', partnerSlug: 'banco-a' }));
    const tampered = raw.slice(0, -2) + (raw.at(-2) === 'A' ? 'B' : 'A') + raw.at(-1);
    assert.equal(unseal(tampered), null);
  });

  await t.test('P9: exp vencido con partner ⇒ inválida (null)', () => {
    const { seal, unseal } = createSessionSeal({ key, now: () => Date.now() + 4_000_000 });
    const raw = seal(payload({ partnerId: 'p-abc', partnerSlug: 'banco-a' }));
    assert.equal(unseal(raw), null);
  });
});
