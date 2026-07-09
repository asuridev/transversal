import { test } from 'node:test';
import assert from 'node:assert/strict';

import { issueCsrfToken, verifyCsrf } from './csrf.ts';

test('csrf', async (t) => {
  await t.test('P1: issueCsrfToken emite un token base64url no vacío', () => {
    const token = issueCsrfToken();
    assert.ok(token.length > 0);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  await t.test('P2: dos emisiones son distintas (randomBytes)', () => {
    assert.notEqual(issueCsrfToken(), issueCsrfToken());
  });

  await t.test('P3: verifyCsrf ⇒ true cuando cookie y header coinciden', () => {
    const token = issueCsrfToken();
    assert.equal(verifyCsrf(token, token), true);
  });

  await t.test('P4: verifyCsrf ⇒ false cuando difieren', () => {
    assert.equal(verifyCsrf(issueCsrfToken(), issueCsrfToken()), false);
  });

  await t.test('P5: verifyCsrf ⇒ false cuando falta cookie o header', () => {
    const token = issueCsrfToken();
    assert.equal(verifyCsrf(undefined, token), false);
    assert.equal(verifyCsrf(token, undefined), false);
    assert.equal(verifyCsrf(undefined, undefined), false);
  });
});
