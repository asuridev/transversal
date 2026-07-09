import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Partner, NewPartner, PartnerQuery } from '../../../shared/partner/partner-model.ts';
import type { PartnerTheme, NewThemeVersion } from '../../../shared/partner/partner-theme-model.ts';
import type { PartnerRepository } from '../../../server/persistence/partner-repository.ts';
import type { TenantResolution } from '../tenant/tenant-resolution-model.ts';
import { DEFAULT_PARTNER_SLUG, getDefaultPublicTheme } from '../../../shared/partner/default-public-theme.ts';
import { popularThemeFixture } from '../../../server/persistence/__fixtures__/brands.ts';
import { resolveActiveTheme } from './resolve-active-theme.server.ts';

const SYSTEM_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function makePartner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: 'partner-1',
    slug: 'popular',
    partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae',
    displayName: 'Banco Popular',
    status: 'active',
    themeId: 'theme-1',
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
    createdBy: 'tester',
    updatedBy: 'tester',
    ...overrides,
  };
}

function makeTheme(overrides: Partial<PartnerTheme> = {}): PartnerTheme {
  return {
    id: 'theme-1',
    partnerId: 'partner-1',
    version: 1,
    tokens: popularThemeFixture.tokens,
    assets: popularThemeFixture.assets,
    legal: popularThemeFixture.legal,
    typography: popularThemeFixture.typography,
    publishedAt: SYSTEM_TIMESTAMP,
    createdBy: 'tester',
    createdAt: SYSTEM_TIMESTAMP,
    ...overrides,
  };
}

class FakePartnerRepository implements PartnerRepository {
  private readonly partner: Partner | null;
  private readonly theme: PartnerTheme | null;

  constructor(partner: Partner | null, theme: PartnerTheme | null) {
    this.partner = partner;
    this.theme = theme;
  }

  async findActiveSlugs(): Promise<string[]> {
    return this.partner ? [this.partner.slug] : [];
  }

  async findBySlug(slug: string): Promise<Partner | null> {
    return this.partner && this.partner.slug === slug ? this.partner : null;
  }

  async getPublishedTheme(_slug: string): Promise<PartnerTheme | null> {
    return this.theme;
  }

  async listPartners(_query: PartnerQuery): Promise<Partner[]> {
    return this.partner ? [this.partner] : [];
  }

  async createPartner(
    _input: NewPartner,
    _firstTheme: NewThemeVersion,
  ): Promise<{ partner: Partner; theme: PartnerTheme }> {
    throw new Error('not implemented in fake');
  }

  async saveThemeVersion(_partnerId: string, _theme: NewThemeVersion): Promise<PartnerTheme> {
    throw new Error('not implemented in fake');
  }

  async publishThemeVersion(_partnerId: string, _themeId: string): Promise<void> {
    throw new Error('not implemented in fake');
  }

  async deactivatePartner(_partnerId: string): Promise<void> {
    throw new Error('not implemented in fake');
  }

  async activatePartner(_partnerId: string): Promise<void> {
    throw new Error('not implemented in fake');
  }

  async findById(id: string): Promise<Partner | null> {
    return this.partner && this.partner.id === id ? this.partner : null;
  }

  async getThemeById(themeId: string): Promise<PartnerTheme | null> {
    return this.theme && this.theme.id === themeId ? this.theme : null;
  }

  async getLatestDraftTheme(_partnerId: string): Promise<PartnerTheme | null> {
    return null;
  }
}

describe('resolveActiveTheme', () => {
  it("kind:'partner' con theme publicado devuelve el PublicTheme de ese partner", async () => {
    const repo = new FakePartnerRepository(makePartner(), makeTheme());
    const resolution: TenantResolution = { kind: 'partner', slug: 'popular' };

    const theme = await resolveActiveTheme(resolution, repo);

    assert.equal(theme.slug, 'popular');
    assert.equal(theme.displayName, 'Banco Popular');
    assert.equal(theme.tokens.colorPrimary, popularThemeFixture.tokens.colorPrimary);
  });

  it("kind:'partner' sin theme publicado (solo borrador) cae al default", async () => {
    const repo = new FakePartnerRepository(makePartner(), null);
    const resolution: TenantResolution = { kind: 'partner', slug: 'popular' };

    const theme = await resolveActiveTheme(resolution, repo);

    assert.equal(theme.slug, DEFAULT_PARTNER_SLUG);
    assert.deepEqual(theme, getDefaultPublicTheme());
  });

  it("kind:'fallback' | 'root' | 'reserved' devuelven el MISMO default indistinguible", async () => {
    const repo = new FakePartnerRepository(null, null);
    const resolutions: TenantResolution[] = [
      { kind: 'fallback', reason: 'unknown-slug' },
      { kind: 'root' },
      { kind: 'reserved', area: 'admin' },
    ];

    const themes = await Promise.all(resolutions.map((r) => resolveActiveTheme(r, repo)));

    for (const theme of themes) {
      assert.deepEqual(theme, getDefaultPublicTheme());
    }
  });

  it('el PublicTheme resuelto es serializable en round-trip (JSON.stringify/parse)', async () => {
    const repo = new FakePartnerRepository(makePartner(), makeTheme());
    const resolution: TenantResolution = { kind: 'partner', slug: 'popular' };

    const theme = await resolveActiveTheme(resolution, repo);
    const roundTripped = JSON.parse(JSON.stringify(theme));

    assert.deepEqual(roundTripped, theme);
  });
});
