import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveModuleRoute, moduleExists, type ModuleCatalogEntry } from './module-catalog.ts';

const catalog: readonly ModuleCatalogEntry[] = [
  { moduleId: 'open', route: '/open' },
  { moduleId: 'partner-only', route: '/partner-only', requiresPartner: true },
  { moduleId: 'admin-only', route: '/admin-only', requiredRoles: ['platform-admin'] },
  { moduleId: 'unsafe', route: 'http://evil.example.com' },
];

test('resolveModuleRoute', async (t) => {
  await t.test('módulo inexistente ⇒ null', () => {
    assert.equal(resolveModuleRoute('nope', { roles: [], hasPartner: false }, catalog), null);
  });

  await t.test('roles sin intersección ⇒ null', () => {
    assert.equal(resolveModuleRoute('admin-only', { roles: ['auditor'], hasPartner: false }, catalog), null);
  });

  await t.test('requiresPartner sin partner ⇒ null', () => {
    assert.equal(resolveModuleRoute('partner-only', { roles: [], hasPartner: false }, catalog), null);
  });

  await t.test('ruta no relativa/saneada ⇒ null (nunca ruta arbitraria)', () => {
    assert.equal(resolveModuleRoute('unsafe', { roles: [], hasPartner: false }, catalog), null);
  });

  await t.test('éxito ⇒ ruta saneada del catálogo', () => {
    assert.equal(resolveModuleRoute('open', { roles: [], hasPartner: false }, catalog), '/open');
    assert.equal(resolveModuleRoute('partner-only', { roles: [], hasPartner: true }, catalog), '/partner-only');
    assert.equal(resolveModuleRoute('admin-only', { roles: ['platform-admin'], hasPartner: false }, catalog), '/admin-only');
  });
});

test('moduleExists', async (t) => {
  await t.test('true para moduleId presente', () => {
    assert.equal(moduleExists('open', catalog), true);
  });

  await t.test('false para moduleId ausente', () => {
    assert.equal(moduleExists('nope', catalog), false);
  });
});
