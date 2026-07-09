import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toPublicTheme } from './theme-projection.ts';
import type { Partner } from './partner-model.ts';
import type { PartnerTheme } from './partner-theme-model.ts';

const EXPECTED_KEYS = ['slug', 'displayName', 'version', 'tokens', 'assets', 'legal', 'typography'].sort();

function buildPartner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: 'partner-uuid',
    slug: 'popular',
    partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae',
    displayName: 'Banco Popular',
    status: 'active',
    themeId: 'theme-uuid',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'admin-sub',
    updatedBy: 'admin-sub',
    ...overrides,
  };
}

function buildTheme(overrides: Partial<PartnerTheme> = {}): PartnerTheme {
  return {
    id: 'theme-uuid',
    partnerId: 'partner-uuid',
    version: 7,
    tokens: {
      colorPrimary: '#00A056',
      colorPrimaryTint: '#E9F0D6',
      colorSecondary: '#8FB434',
      colorSecondaryTint: '#D2E1AE',
      colorTextStrong: '#000000',
      colorTextMuted: '#808080',
      colorSurface: '#FFFFFF',
      colorBorder: '#EBEBEB',
    },
    assets: {
      logoUrl: 'https://cdn.example.com/popular/logo.svg',
      faviconUrl: 'https://cdn.example.com/popular/favicon.ico',
      coBrandBankLogoUrl: 'https://cdn.example.com/popular/banco-popular.svg',
    },
    legal: { footerDisclaimer: 'Vigilado por la Superintendencia Financiera de Colombia.' },
    typography: { fontFamily: 'Poppins' },
    publishedAt: '2026-01-02T00:00:00.000Z',
    createdBy: 'admin-sub',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toPublicTheme', () => {
  it('P1: shape exacto — solo las 7 claves del contrato', () => {
    const publicTheme = toPublicTheme(buildTheme(), buildPartner());
    assert.deepEqual(Object.keys(publicTheme).sort(), EXPECTED_KEYS);
  });

  it('P2: cero fugas — ninguna clave interna aparece', () => {
    const publicTheme = toPublicTheme(buildTheme(), buildPartner()) as Record<string, unknown>;
    for (const internalKey of [
      'id',
      'partnerId',
      'themeId',
      'createdBy',
      'publishedAt',
      'status',
      'createdAt',
      'updatedAt',
      'updatedBy',
    ]) {
      assert.equal(publicTheme[internalKey], undefined);
    }
  });

  it('P3: Popular y Occidente producen idéntico set de claves', () => {
    const popular = toPublicTheme(buildTheme(), buildPartner());
    const occidente = toPublicTheme(
      buildTheme({
        tokens: {
          colorPrimary: '#008ACC',
          colorPrimaryTint: '#B6ECFF',
          colorSecondary: '#002449',
          colorSecondaryTint: '#CCD3DB',
          colorTextStrong: '#262626',
          colorTextMuted: '#808080',
          colorSurface: '#FFFFFF',
          colorBorder: '#CCCCCC',
        },
      }),
      buildPartner({ slug: 'occidente', displayName: 'Banco de Occidente' }),
    );

    assert.deepEqual(Object.keys(popular).sort(), Object.keys(occidente).sort());
  });
});
