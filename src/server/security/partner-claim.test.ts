import { test } from 'node:test';
import assert from 'node:assert/strict';

import { derivePartnerRef, type PartnerClaimConfig } from './partner-claim.ts';

const config: PartnerClaimConfig = { partnerClaimPath: 'partner' };

test('derivePartnerRef', async (t) => {
  await t.test('P1: string único ⇒ slug', () => {
    assert.equal(derivePartnerRef({ partner: 'banco-a' }, config), 'banco-a');
  });

  await t.test('P2: array de 1 ⇒ slug', () => {
    assert.equal(derivePartnerRef({ partner: ['banco-a'] }, config), 'banco-a');
  });

  await t.test('P3: ausente ⇒ null (FR-008)', () => {
    assert.equal(derivePartnerRef({}, config), null);
  });

  await t.test('P4: vacío ("") ⇒ null', () => {
    assert.equal(derivePartnerRef({ partner: '' }, config), null);
  });

  await t.test('P5: array vacío ⇒ null', () => {
    assert.equal(derivePartnerRef({ partner: [] }, config), null);
  });

  await t.test('P6: array con más de un valor ⇒ null (inconsistente, edge multi-partner)', () => {
    assert.equal(derivePartnerRef({ partner: ['banco-a', 'banco-b'] }, config), null);
  });

  await t.test('P7: tipo inválido (número) ⇒ null', () => {
    assert.equal(derivePartnerRef({ partner: 42 }, config), null);
  });

  await t.test('P8: tipo inválido (objeto) ⇒ null', () => {
    assert.equal(derivePartnerRef({ partner: { foo: 'bar' } }, config), null);
  });

  await t.test('P9: path anidado se resuelve igual que role-map (readClaimPath)', () => {
    const nestedConfig: PartnerClaimConfig = { partnerClaimPath: 'attrs.partner' };
    assert.equal(derivePartnerRef({ attrs: { partner: 'banco-a' } }, nestedConfig), 'banco-a');
  });

  await t.test('P10: path anidado ausente ⇒ null', () => {
    const nestedConfig: PartnerClaimConfig = { partnerClaimPath: 'attrs.partner' };
    assert.equal(derivePartnerRef({}, nestedConfig), null);
  });

  await t.test('P11: null explícito ⇒ null', () => {
    assert.equal(derivePartnerRef({ partner: null }, config), null);
  });
});
