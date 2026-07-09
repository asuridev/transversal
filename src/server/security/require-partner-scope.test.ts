import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express, { type Request, type NextFunction } from 'express';
import type { AddressInfo } from 'node:net';

import { requirePartnerScope, partnerScopeFilter, type PartnerScopeDeps } from './require-partner-scope.ts';
import { createSessionSeal, type SealedSession } from './session-seal.ts';

const key = randomBytes(32).toString('base64');
const seal = createSessionSeal({ key });

function sessionCookie(overrides: Partial<SealedSession> = {}): string {
  const iat = Math.floor(Date.now() / 1000);
  // Las sesiones de asesor llevan `partnerKey` sellado (009); el admin (P2, sin
  // partnerId/slug) es rechazado antes de mirarlo.
  return seal.seal({
    sub: 'u-asesor-a',
    name: 'Asesor A',
    roles: [],
    partnerKey: 'partner-key-a',
    iat,
    exp: iat + 3600,
    ...overrides,
  });
}

function baseDeps(overrides: Partial<PartnerScopeDeps> = {}): PartnerScopeDeps {
  return {
    sessionSeal: seal,
    isActivePartner: async () => true,
    recordCrossPartnerDenied: async () => {},
    ...overrides,
  };
}

async function withServer(
  deps: PartnerScopeDeps,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use((req: Request, _res, next: NextFunction) => {
    req.requestId = 'test-request-id';
    next();
  });
  app.get('/:slug/action', requirePartnerScope(deps), (req, res) => {
    res.status(200).json({ ok: true, partner: req.partner });
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('requirePartnerScope', async (t) => {
  await t.test('P1: sin cookie de sesión ⇒ 401', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/banco-a/action`);
      assert.equal(res.status, 401);
    });
  });

  await t.test('P2: sesión sin partner (admin) ⇒ 404 sin revelar nada', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie(); // sin partnerId/partnerSlug
      const res = await fetch(`${baseUrl}/banco-a/action`, { headers: { cookie: `bo_session=${cookie}` } });
      assert.equal(res.status, 404);
    });
  });

  await t.test('P3: match exacto ⇒ next() con req.partner (200)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/banco-a/action`, { headers: { cookie: `bo_session=${cookie}` } });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { partner: { id: string; slug: string } };
      assert.deepEqual(body.partner, {
        id: 'p-a',
        slug: 'banco-a',
        partnerKey: 'partner-key-a',
        actorSub: 'u-asesor-a',
        actorName: 'Asesor A',
      });
    });
  });

  await t.test('P3b: asesor con partnerId/slug pero sin partnerKey ⇒ 404 (sesión no operable)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a', partnerKey: undefined });
      const res = await fetch(`${baseUrl}/banco-a/action`, { headers: { cookie: `bo_session=${cookie}` } });
      assert.equal(res.status, 404);
    });
  });

  await t.test('P4: cruce (slug distinto) ⇒ 404 + auditoría (sin enumeración)', async () => {
    let recorded: { actorSub: string; actorName: string; attemptedSlug: string } | undefined;
    await withServer(
      baseDeps({
        recordCrossPartnerDenied: async (event) => {
          recorded = event;
        },
      }),
      async (baseUrl) => {
        const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
        const res = await fetch(`${baseUrl}/banco-b/action`, { headers: { cookie: `bo_session=${cookie}` } });
        assert.equal(res.status, 404);
      },
    );
    assert.deepEqual(recorded, { actorSub: 'u-asesor-a', actorName: 'Asesor A', attemptedSlug: 'banco-b' });
  });

  await t.test('P5: partner de sesión ya no activo ⇒ 404 (edge "partner desactivado")', async () => {
    await withServer(baseDeps({ isActivePartner: async () => false }), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/banco-a/action`, { headers: { cookie: `bo_session=${cookie}` } });
      assert.equal(res.status, 404);
    });
  });

  await t.test('P6: slug sintácticamente inválido ⇒ 400 invalid_input', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/${encodeURIComponent('B@nco!')}/action`, {
        headers: { cookie: `bo_session=${cookie}` },
      });
      assert.equal(res.status, 400);
    });
  });

  await t.test('P7: sesión expirada ⇒ 401', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const iat = Math.floor(Date.now() / 1000) - 10_000;
      const cookie = seal.seal({
        sub: 'u-x',
        name: 'X',
        roles: [],
        partnerId: 'p-a',
        partnerSlug: 'banco-a',
        iat,
        exp: iat + 1,
      });
      const res = await fetch(`${baseUrl}/banco-a/action`, { headers: { cookie: `bo_session=${cookie}` } });
      assert.equal(res.status, 401);
    });
  });

  await t.test('P8: cruce no se amplía por un filtro/id de partner suministrado en query (US3)', async () => {
    let recorded: { attemptedSlug: string } | undefined;
    await withServer(
      baseDeps({
        recordCrossPartnerDenied: async (event) => {
          recorded = event;
        },
      }),
      async (baseUrl) => {
        const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
        const res = await fetch(`${baseUrl}/banco-b/action?partner=banco-a`, {
          headers: { cookie: `bo_session=${cookie}` },
        });
        // El scope se deriva del :slug de la ruta, no del query; el query no
        // amplía ni reduce el rechazo del cruce detectado en la URL.
        assert.equal(res.status, 404);
      },
    );
    assert.equal(recorded?.attemptedSlug, 'banco-b');
  });

  await t.test('P9 (US3): ruta sin :slug ⇒ alcance derivado íntegramente de la sesión', async () => {
    const app = express();
    app.use((req: Request, _res, next: NextFunction) => {
      req.requestId = 'test-request-id';
      next();
    });
    app.get('/customers', requirePartnerScope(baseDeps()), (req, res) => {
      res.status(200).json({ scope: partnerScopeFilter(req) });
    });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`http://127.0.0.1:${port}/customers?partner=banco-b`, {
        headers: { cookie: `bo_session=${cookie}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { scope: { partnerId: string } };
      // El filtro de partner del query se ignora — el alcance viene de la sesión (FR-006).
      assert.deepEqual(body.scope, { partnerId: 'p-a' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
