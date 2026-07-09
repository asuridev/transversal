import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { createApiRouter } from './api-router.ts';
import type { PartnerRepository } from '../persistence/partner-repository.ts';
import type { Partner } from '../../shared/partner/partner-model.ts';
import type { PartnerTheme } from '../../shared/partner/partner-theme-model.ts';
import type { SecretResolver } from '../secrets/secret-resolver.ts';
import type { AdminAuthGuard } from '../security/admin-auth-guard.ts';
import { createInMemoryAssetStorage } from '../assets/asset-storage.ts';
import type { AuthRouterDeps } from './auth-router.ts';
import { createSessionSeal } from '../security/session-seal.ts';

const THEME_FIXTURE_FIELDS = {
  tokens: {
    colorPrimary: '#000',
    colorPrimaryTint: '#111',
    colorSecondary: '#222',
    colorSecondaryTint: '#333',
    colorTextStrong: '#444',
    colorTextMuted: '#555',
    colorSurface: '#666',
    colorBorder: '#777',
  },
  assets: { logoUrl: 'https://x/logo.png', faviconUrl: 'https://x/f.ico', coBrandBankLogoUrl: 'https://x/b.png' },
  legal: { footerDisclaimer: 'x' },
  typography: { fontFamily: 'Inter' },
};

function fakeRepository(): PartnerRepository {
  const partner: Partner = {
    id: 'p1',
    slug: 'banco-popular',
    partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae',
    displayName: 'Banco Popular',
    status: 'active',
    themeId: 't1',
    createdAt: 'now',
    updatedAt: 'now',
    createdBy: 'seed',
    updatedBy: 'seed',
  };
  const theme: PartnerTheme = {
    id: 't1',
    partnerId: 'p1',
    version: 3,
    ...THEME_FIXTURE_FIELDS,
    publishedAt: 'now',
    createdBy: 'seed',
    createdAt: 'now',
  };

  return {
    async findActiveSlugs() {
      return ['banco-popular'];
    },
    async findBySlug(slug: string) {
      return slug === 'banco-popular' ? partner : null;
    },
    async findById(id: string) {
      return id === 'p1' ? partner : null;
    },
    async getThemeById(themeId: string) {
      return themeId === 't1' ? theme : null;
    },
    async getLatestDraftTheme() {
      return null;
    },
    async getPublishedTheme(slug: string) {
      return slug === 'banco-popular' ? theme : null;
    },
    async listPartners() {
      return [partner];
    },
    async createPartner() {
      throw new Error('not used in this test');
    },
    async saveThemeVersion() {
      throw new Error('not used in this test');
    },
    async publishThemeVersion() {},
    async deactivatePartner() {},
    async activatePartner() {},
    async listAuditLog() {
      return [];
    },
  };
}

function fakeSecretResolver(): SecretResolver {
  return {
    async resolve() {
      return null;
    },
    invalidate() {},
    async isConfigured() {
      return true;
    },
  };
}

function denyAllGuard(): AdminAuthGuard {
  return {
    async authorize() {
      throw new Error('unauthorized');
    },
  };
}

function allowAllGuard(): AdminAuthGuard {
  return {
    async authorize() {
      return { subject: 'admin-1', name: 'Admin Uno', roles: ['platform-admin'] };
    },
  };
}

function fakeAuthRouterDeps(): AuthRouterDeps {
  return {
    buildAuthorizationRequest: async (redirectUri) => ({
      url: new URL(`https://idp.example.com/auth?redirect_uri=${encodeURIComponent(redirectUri)}`),
      codeVerifier: 'v',
      state: 's',
      nonce: 'n',
    }),
    exchangeAuthorizationCode: async () => ({ sub: 'u', name: 'U' }),
    sessionSeal: createSessionSeal({ key: Buffer.alloc(32).toString('base64') }),
    txSealKey: Buffer.alloc(32).toString('base64'),
    roleMapConfig: { roleClaimPath: 'roles', roleMap: {} },
    sessionTtlSeconds: 3600,
    redirectUri: 'http://localhost:4000/api/auth/callback',
    secureCookies: false,
  };
}

async function startServer(adminAuthGuard: AdminAuthGuard) {
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      partnerRepository: fakeRepository(),
      secretResolver: fakeSecretResolver(),
      adminAuthGuard,
      assetStorage: createInMemoryAssetStorage(),
      authRouterDeps: fakeAuthRouterDeps(),
      masheryAuthConfig: { authBaseUrl: 'http://mashery-auth.local' },
      contactInfoConfig: { customerBaseUrl: 'http://customer.local' },
    }),
  );
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('api-router: GET /api/theme/:slug', async (t) => {
  const { baseUrl, close } = await startServer(denyAllGuard());
  try {
    await t.test('P1: shape público sin apiKey/baseUrl/IDs, con Cache-Control + ETag', async () => {
      const res = await fetch(`${baseUrl}/api/theme/banco-popular`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.slug, 'banco-popular');
      assert.ok(!JSON.stringify(body).match(/apiKey|baseUrl|partnerId|"id":/));
      assert.ok(res.headers.get('cache-control'));
      assert.ok(res.headers.get('etag'));
    });

    await t.test('P2: If-None-Match igual → 304', async () => {
      const first = await fetch(`${baseUrl}/api/theme/banco-popular`);
      const etag = first.headers.get('etag')!;
      const second = await fetch(`${baseUrl}/api/theme/banco-popular`, { headers: { 'If-None-Match': etag } });
      assert.equal(second.status, 304);
    });

    await t.test('P3: slug inexistente → 200 default (no 404)', async () => {
      const res = await fetch(`${baseUrl}/api/theme/no-existe-este-slug`);
      assert.equal(res.status, 200);
    });

    await t.test('P4: slug inválido → 400 invalid_input', async () => {
      const res = await fetch(`${baseUrl}/api/theme/A!!`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.code, 'invalid_input');
    });
  } finally {
    await close();
  }
});

test('api-router: GET /api/partners/active', async (t) => {
  const { baseUrl, close } = await startServer(denyAllGuard());
  try {
    await t.test('P1: solo slugs activos', async () => {
      const res = await fetch(`${baseUrl}/api/partners/active`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { slugs: ['banco-popular'] });
    });
  } finally {
    await close();
  }
});

test('api-router: /api/admin/* protegido', async (t) => {
  await t.test('P1: sin sesión válida → 401/403 sin ejecutar acción', async () => {
    const { baseUrl, close } = await startServer(denyAllGuard());
    try {
      const res = await fetch(`${baseUrl}/api/admin/partners`);
      assert.ok(res.status === 401 || res.status === 403);
    } finally {
      await close();
    }
  });

  await t.test('P2: con sesión válida → credentialConfigured sin apiKey/baseUrl', async () => {
    const { baseUrl, close } = await startServer(allowAllGuard());
    try {
      const res = await fetch(`${baseUrl}/api/admin/partners`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body[0].credentialConfigured, true);
      assert.ok(!JSON.stringify(body).match(/apiKey|baseUrl/));
    } finally {
      await close();
    }
  });
});
