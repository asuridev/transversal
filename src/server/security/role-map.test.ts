import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveRoles, type RoleMapConfig } from './role-map.ts';

const config: RoleMapConfig = {
  roleClaimPath: 'realm_access.roles',
  roleMap: {
    'platform-admin': 'platform-admin',
    'partner-editor': 'partner-editor',
    auditor: 'auditor',
  },
};

test('deriveRoles', async (t) => {
  await t.test('P1: mapea claims conocidos a AppRole[]', () => {
    const claims = { realm_access: { roles: ['platform-admin'] } };
    assert.deepEqual(deriveRoles(claims, config), ['platform-admin']);
  });

  await t.test('P2: dedup — claims repetidos no duplican roles', () => {
    const claims = { realm_access: { roles: ['auditor', 'auditor'] } };
    assert.deepEqual(deriveRoles(claims, config), ['auditor']);
  });

  await t.test('P3: sin match ⇒ [] (menor privilegio, D5)', () => {
    const claims = { realm_access: { roles: ['unknown-role'] } };
    assert.deepEqual(deriveRoles(claims, config), []);
  });

  await t.test('P4: claim path ausente ⇒ []', () => {
    assert.deepEqual(deriveRoles({}, config), []);
  });

  await t.test('P5: múltiples roles mapeados conservan orden de primera aparición', () => {
    const claims = { realm_access: { roles: ['partner-editor', 'platform-admin'] } };
    assert.deepEqual(deriveRoles(claims, config), ['partner-editor', 'platform-admin']);
  });
});
