import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Request, type NextFunction } from 'express';

import { createPublicRouter } from './public-router.ts';
import type { PartnerRepository } from '../persistence/partner-repository.ts';
import type { Partner } from '../../shared/partner/partner-model.ts';
import type { PartnerTheme } from '../../shared/partner/partner-theme-model.ts';

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
    slug: 'banco-a',
    partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae',
    displayName: 'Banco A',
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
      return ['banco-a'];
    },
    async findBySlug(slug: string) {
      return slug === 'banco-a' ? partner : null;
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
      return slug === 'banco-a' ? theme : null;
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
    async appendAccessDenied() {},
  };
}

async function startServer(webviewLoginOrigins: readonly string[]) {
  const app = express();
  app.use((req: Request, _res, next: NextFunction) => {
    req.requestId = 'test-request-id';
    next();
  });
  app.use(createPublicRouter({ partnerRepository: fakeRepository(), webviewLoginOrigins }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const ALLOWED_ORIGIN = 'https://login.partner.example';

test('theme-cors contract', async (t) => {
  const { baseUrl, close } = await startServer([ALLOWED_ORIGIN]);
  try {
    await t.test('CT-20: origen permitido ⇒ Access-Control-Allow-Origin + Vary', async () => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, { headers: { Origin: ALLOWED_ORIGIN } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
      assert.equal(res.headers.get('vary'), 'Origin');
    });

    await t.test('CT-21: preflight OPTIONS con origen permitido ⇒ 204 con Allow-Methods/Allow-Headers', async () => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, {
        method: 'OPTIONS',
        headers: { Origin: ALLOWED_ORIGIN },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
      assert.equal(res.headers.get('access-control-allow-headers'), 'If-None-Match');
    });

    await t.test('CT-22: origen no permitido ⇒ sin cabeceras CORS', async () => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, { headers: { Origin: 'https://evil.example.com' } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    await t.test('CT-23: PublicTheme sanitizado + ETag, sin campos internos', async () => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, { headers: { Origin: ALLOWED_ORIGIN } });
      const body = await res.json();
      assert.equal(body.slug, 'banco-a');
      assert.ok(!JSON.stringify(body).match(/apiKey|baseUrl|partnerId|"id":/));
      assert.ok(res.headers.get('etag'));
    });

    await t.test('CT-24: partner inactivo/sin tema ⇒ tema neutro por defecto', async () => {
      const res = await fetch(`${baseUrl}/theme/no-existe`, { headers: { Origin: ALLOWED_ORIGIN } });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.slug, '__default__');
    });

    await t.test('CT-25: sin Access-Control-Allow-Credentials', async () => {
      const res = await fetch(`${baseUrl}/theme/banco-a`, { headers: { Origin: ALLOWED_ORIGIN } });
      assert.equal(res.headers.get('access-control-allow-credentials'), null);
    });
  } finally {
    await close();
  }
});

test('theme-cors: GET /partners/active también respeta el allowlist', async (t) => {
  const { baseUrl, close } = await startServer([ALLOWED_ORIGIN]);
  try {
    await t.test('CT-20 (partners/active): origen permitido ⇒ cabeceras CORS', async () => {
      const res = await fetch(`${baseUrl}/partners/active`, { headers: { Origin: ALLOWED_ORIGIN } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
    });
  } finally {
    await close();
  }
});
