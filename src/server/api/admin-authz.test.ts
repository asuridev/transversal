import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { createAdminRouter } from './admin-router.ts';
import type { PartnerRepository } from '../persistence/partner-repository.ts';
import type { Partner } from '../../shared/partner/partner-model.ts';
import type { PartnerTheme } from '../../shared/partner/partner-theme-model.ts';
import type { SecretResolver } from '../secrets/secret-resolver.ts';
import type { AdminAuthGuard, AdminSession } from '../security/admin-auth-guard.ts';
import { createInMemoryAssetStorage } from '../assets/asset-storage.ts';
import { issueCsrfToken } from '../security/csrf.ts';

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
    async findById() {
      return partner;
    },
    async getThemeById() {
      return theme;
    },
    async getLatestDraftTheme() {
      return null;
    },
    async getPublishedTheme() {
      return theme;
    },
    async listPartners() {
      return [partner];
    },
    async createPartner() {
      return { partner, theme };
    },
    async saveThemeVersion() {
      return theme;
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

function guardFor(session: AdminSession | null): AdminAuthGuard {
  return {
    async authorize() {
      if (!session) {
        throw new Error('unauthorized');
      }
      return session;
    },
  };
}

async function startServer(session: AdminSession | null) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const assetStorage = createInMemoryAssetStorage();
  app.use('/admin', createAdminRouter({
    partnerRepository: fakeRepository(),
    secretResolver: fakeSecretResolver(),
    adminAuthGuard: guardFor(session),
    assetStorage,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/admin`,
    assetStorage,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function withCsrf(): { headers: Record<string, string> } {
  const token = issueCsrfToken();
  return { headers: { cookie: `csrf=${token}`, 'x-csrf-token': token } };
}

test('admin-authz matrix', async (t) => {
  await t.test('P1: sin bo_session ⇒ 401 en toda /admin/*', async () => {
    const { baseUrl, close } = await startServer(null);
    try {
      const res1 = await fetch(`${baseUrl}/partners`);
      assert.equal(res1.status, 401);
      const res2 = await fetch(`${baseUrl}/audit`);
      assert.equal(res2.status, 401);
    } finally {
      await close();
    }
  });

  await t.test('P2: auditor en GET /partners y GET /audit ⇒ 200', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Ana', roles: ['auditor'] });
    try {
      assert.equal((await fetch(`${baseUrl}/partners`)).status, 200);
      assert.equal((await fetch(`${baseUrl}/audit`)).status, 200);
    } finally {
      await close();
    }
  });

  await t.test('P3: auditor en POST /partners ⇒ 403 sin efecto (incluso con CSRF válido)', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Ana', roles: ['auditor'] });
    try {
      const csrf = withCsrf();
      const res = await fetch(`${baseUrl}/partners`, {
        method: 'POST',
        headers: { ...csrf.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'nuevo', displayName: 'Nuevo' }),
      });
      assert.equal(res.status, 403);
    } finally {
      await close();
    }
  });

  await t.test('P4: rol desconocido/[] ⇒ 403 en todo /admin/*', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Sin Rol', roles: [] });
    try {
      assert.equal((await fetch(`${baseUrl}/partners`)).status, 403);
      assert.equal((await fetch(`${baseUrl}/audit`)).status, 403);
    } finally {
      await close();
    }
  });

  await t.test('P5: mutación sin X-CSRF-Token válido ⇒ 403', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const res = await fetch(`${baseUrl}/partners`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'nuevo', displayName: 'Nuevo' }),
      });
      assert.equal(res.status, 403);
    } finally {
      await close();
    }
  });

  await t.test('P6: partner-editor con CSRF válido ⇒ 201 en POST /partners', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const csrf = withCsrf();
      const res = await fetch(`${baseUrl}/partners`, {
        method: 'POST',
        headers: { ...csrf.headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'nuevo',
          partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae',
          displayName: 'Nuevo',
        }),
      });
      assert.equal(res.status, 201);
    } finally {
      await close();
    }
  });

  await t.test('P6b: POST /partners sin partnerKey ⇒ 400 invalid_input', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const csrf = withCsrf();
      const res = await fetch(`${baseUrl}/partners`, {
        method: 'POST',
        headers: { ...csrf.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'nuevo', displayName: 'Nuevo' }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { code: string; details?: { field?: string } };
      assert.equal(body.code, 'invalid_input');
      assert.equal(body.details?.field, 'partnerKey');
    } finally {
      await close();
    }
  });

  await t.test('P6c: POST /partners con partnerKey no-UUID ⇒ 400 invalid_input', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const csrf = withCsrf();
      const res = await fetch(`${baseUrl}/partners`, {
        method: 'POST',
        headers: { ...csrf.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'nuevo', partnerKey: 'no-es-uuid', displayName: 'Nuevo' }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { code: string; details?: { field?: string } };
      assert.equal(body.code, 'invalid_input');
      assert.equal(body.details?.field, 'partnerKey');
    } finally {
      await close();
    }
  });

  await t.test('P7: platform-admin puede todo (lectura y mutación con CSRF)', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Admin', roles: ['platform-admin'] });
    try {
      assert.equal((await fetch(`${baseUrl}/partners`)).status, 200);
      assert.equal((await fetch(`${baseUrl}/audit`)).status, 200);
      const csrf = withCsrf();
      const res = await fetch(`${baseUrl}/partners/p1/deactivate`, { method: 'POST', headers: csrf.headers });
      assert.equal(res.status, 200);
    } finally {
      await close();
    }
  });
});

const PARTNER_ID = '065ca891-5fbc-4c90-b526-286745bd3c5d';

function uploadBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    partnerId: PARTNER_ID,
    slot: 'logo',
    mimeType: 'image/png',
    base64: Buffer.from('first-bytes').toString('base64'),
    ...overrides,
  });
}

test('POST /admin/assets — key estable <partnerId>-<slot>.<ext>', async (t) => {
  await t.test('deriva el key del partnerId+slot y devuelve /assets/<key>', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const res = await fetch(`${baseUrl}/assets`, {
        method: 'POST',
        headers: { ...withCsrf().headers, 'content-type': 'application/json' },
        body: uploadBody(),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.key, `${PARTNER_ID}-logo.png`);
      assert.equal(body.url, `/assets/${PARTNER_ID}-logo.png`);
    } finally {
      await close();
    }
  });

  await t.test('re-subir el mismo slot reusa el key y sobrescribe los bytes', async () => {
    const { baseUrl, assetStorage, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const first = await fetch(`${baseUrl}/assets`, {
        method: 'POST',
        headers: { ...withCsrf().headers, 'content-type': 'application/json' },
        body: uploadBody(),
      });
      const second = await fetch(`${baseUrl}/assets`, {
        method: 'POST',
        headers: { ...withCsrf().headers, 'content-type': 'application/json' },
        body: uploadBody({ base64: Buffer.from('second-bytes').toString('base64') }),
      });
      const firstKey = (await first.json()).key;
      const secondKey = (await second.json()).key;
      assert.equal(firstKey, secondKey); // mismo archivo, no un huérfano nuevo

      const stored = await assetStorage.get(secondKey);
      assert.ok(stored);
      assert.equal(Buffer.from(stored.bytes).toString(), 'second-bytes'); // sobrescrito
    } finally {
      await close();
    }
  });

  await t.test('slot fuera del allowlist ⇒ 400 invalid_input', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const res = await fetch(`${baseUrl}/assets`, {
        method: 'POST',
        headers: { ...withCsrf().headers, 'content-type': 'application/json' },
        body: uploadBody({ slot: '../../etc/passwd' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await close();
    }
  });

  await t.test('partnerId con formato inválido ⇒ 400 invalid_input', async () => {
    const { baseUrl, close } = await startServer({ subject: 'u1', name: 'Edi', roles: ['partner-editor'] });
    try {
      const res = await fetch(`${baseUrl}/assets`, {
        method: 'POST',
        headers: { ...withCsrf().headers, 'content-type': 'application/json' },
        body: uploadBody({ partnerId: 'not-a-uuid' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await close();
    }
  });
});
