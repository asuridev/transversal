import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertAllowedTransferStateWrite } from './transfer-state-allowlist.ts';

const VALID_PUBLIC_THEME = {
  slug: 'banco-popular',
  displayName: 'Banco Popular',
  version: 3,
  tokens: { colorPrimary: '#000', colorPrimaryTint: '#111', colorSecondary: '#222', colorSecondaryTint: '#333', colorTextStrong: '#444', colorTextMuted: '#555', colorSurface: '#666', colorBorder: '#777' },
  assets: { logoUrl: 'https://x/logo.png', faviconUrl: 'https://x/f.ico', coBrandBankLogoUrl: 'https://x/b.png' },
  legal: { footerDisclaimer: 'x' },
  typography: { fontFamily: 'Inter' },
};

test('transfer-state-allowlist', async (t) => {
  await t.test('P1: acepta la clave "theme" con la forma exacta de PublicTheme', () => {
    assert.doesNotThrow(() => assertAllowedTransferStateWrite('theme', VALID_PUBLIC_THEME));
  });

  await t.test('P2: rechaza cualquier clave no permitida (ni "theme" ni "session")', () => {
    assert.throws(() => assertAllowedTransferStateWrite('secrets', { apiKey: 'shh' }));
  });

  await t.test('P3: rechaza la clave "theme" si el valor trae campos ajenos a PublicTheme (p. ej. un secreto)', () => {
    assert.throws(() =>
      assertAllowedTransferStateWrite('theme', { ...VALID_PUBLIC_THEME, apiKey: 'leaked' }),
    );
  });

  await t.test('P4: rechaza la clave "theme" si falta algún campo requerido de PublicTheme', () => {
    const { legal, ...incomplete } = VALID_PUBLIC_THEME;
    void legal;
    assert.throws(() => assertAllowedTransferStateWrite('theme', incomplete));
  });

  await t.test('P5: acepta la clave "session" con la forma de AuthUser (admin, sin partner)', () => {
    assert.doesNotThrow(() =>
      assertAllowedTransferStateWrite('session', { subject: 'u-1', name: 'Admin', roles: ['platform-admin'] }),
    );
  });

  await t.test('P6: acepta "session" con partnerId/partnerSlug/partnerKey (asesor)', () => {
    assert.doesNotThrow(() =>
      assertAllowedTransferStateWrite('session', {
        subject: 'u-a',
        name: 'Asesor A',
        roles: [],
        partnerId: 'p-a',
        partnerSlug: 'banco-a',
        partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae',
      }),
    );
  });

  await t.test('P7: rechaza "session" con un campo ajeno (p. ej. el token del IdP)', () => {
    assert.throws(() =>
      assertAllowedTransferStateWrite('session', {
        subject: 'u-1',
        name: 'Admin',
        roles: [],
        idToken: 'leaked.jwt.here',
      }),
    );
  });

  await t.test('P8: rechaza "session" si falta un campo requerido de AuthUser', () => {
    assert.throws(() => assertAllowedTransferStateWrite('session', { subject: 'u-1', name: 'Admin' }));
  });

  await t.test('P9: acepta "partners-active" con un array de slugs (incl. vacío)', () => {
    assert.doesNotThrow(() => assertAllowedTransferStateWrite('partners-active', ['popular', 'occidente']));
    assert.doesNotThrow(() => assertAllowedTransferStateWrite('partners-active', []));
  });

  await t.test('P10: rechaza "partners-active" si no es un array de strings', () => {
    assert.throws(() => assertAllowedTransferStateWrite('partners-active', { slugs: ['popular'] }));
    assert.throws(() => assertAllowedTransferStateWrite('partners-active', ['popular', 42]));
  });
});
