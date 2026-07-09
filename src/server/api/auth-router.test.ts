import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express, { type Request, type NextFunction } from 'express';
import type { AddressInfo } from 'node:net';

import { createAuthRouter, type AuthRouterDeps } from './auth-router.ts';
import { createSessionSeal } from '../security/session-seal.ts';
import { issueCsrfToken } from '../security/csrf.ts';
import type { Partner } from '../../shared/partner/partner-model.ts';
import type { PartnerRepository } from '../persistence/partner-repository.ts';

const sessionKey = randomBytes(32).toString('base64');
const txKey = randomBytes(32).toString('base64');

function stubPartner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: 'p-abc',
    slug: 'banco-a',
    partnerKey: '2efd0584-d38a-4a2f-9dd8-42f2905c3aae',
    displayName: 'Banco A',
    status: 'active',
    themeId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'seed',
    updatedBy: 'seed',
    ...overrides,
  };
}

function stubPartnerRepository(
  partners: Record<string, Partner | null> = {},
): Pick<PartnerRepository, 'findBySlug'> {
  return {
    findBySlug: async (slug: string) => (slug in partners ? partners[slug]! : null),
  };
}

/** Envuelve claims de prueba en el shape `{ claims, idToken }` que ahora devuelve el intercambio OIDC. */
function exchangeResult(claims: Record<string, unknown>): { claims: Record<string, unknown>; idToken: string } {
  return { claims, idToken: 'stub-id-token-jwt' };
}

function baseDeps(overrides: Partial<AuthRouterDeps> = {}): AuthRouterDeps {
  return {
    buildAuthorizationRequest: async (redirectUri) => ({
      url: new URL(`https://idp.example.com/auth?redirect_uri=${encodeURIComponent(redirectUri)}`),
      codeVerifier: 'verifier-1',
      state: 'state-1',
      nonce: 'nonce-1',
    }),
    exchangeAuthorizationCode: async () =>
      exchangeResult({
        sub: 'u-123',
        name: 'Ana Pérez',
        realm_access: { roles: ['partner-editor'] },
      }),
    sessionSeal: createSessionSeal({ key: sessionKey }),
    txSealKey: txKey,
    roleMapConfig: {
      roleClaimPath: 'realm_access.roles',
      roleMap: { 'platform-admin': 'platform-admin', 'partner-editor': 'partner-editor', auditor: 'auditor' },
    },
    partnerClaimConfig: { partnerClaimPath: 'partner' },
    partnerRepository: stubPartnerRepository(),
    sessionTtlSeconds: 3600,
    redirectUri: 'http://localhost:4000/api/auth/callback',
    secureCookies: false,
    ...overrides,
  };
}

async function withServer(deps: AuthRouterDeps, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use((req: Request, _res, next: NextFunction) => {
    req.requestId = 'test-request-id';
    next();
  });
  app.use(createAuthRouter(deps));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function cookiesFrom(res: Response): Record<string, string> {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookies: Record<string, string> = {};
  for (const line of raw) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    cookies[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return cookies;
}

test('auth-router', async (t) => {
  await t.test('P1: GET /auth/login ⇒ 302 al authorization_endpoint + cookie bo_oidc_tx', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
      assert.equal(res.status, 302);
      assert.match(res.headers.get('location') ?? '', /idp\.example\.com/);
      const cookies = cookiesFrom(res);
      assert.ok(cookies['bo_oidc_tx']);
    });
  });

  await t.test('P2: GET /auth/callback emite bo_session+csrf y descarta el access_token del IdP', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
      const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

      const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
        redirect: 'manual',
        headers: { cookie: `bo_oidc_tx=${txCookie}` },
      });
      assert.equal(callbackRes.status, 302);
      const cookies = cookiesFrom(callbackRes);
      assert.ok(cookies['bo_session']);
      assert.ok(cookies['csrf']);
      assert.ok(!JSON.stringify(cookies).includes('access_token'));
    });
  });

  await t.test('P3: GET /admin/session ⇒ 200 con {subject,name,roles} con sesión válida', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const seal = baseDeps().sessionSeal;
      const iat = Math.floor(Date.now() / 1000);
      const raw = seal.seal({ sub: 'u-9', name: 'Beto', roles: ['auditor'], iat, exp: iat + 3600 });

      const res = await fetch(`${baseUrl}/admin/session`, { headers: { cookie: `bo_session=${raw}` } });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { subject: string; name: string; roles: string[] };
      assert.deepEqual(body, { subject: 'u-9', name: 'Beto', roles: ['auditor'] });
    });
  });

  await t.test('P4: GET /admin/session ⇒ 401 sin sesión', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/admin/session`);
      assert.equal(res.status, 401);
    });
  });

  await t.test('P5: POST /auth/logout borra cookies (con CSRF válido)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const token = issueCsrfToken();
      const res = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { cookie: `csrf=${token}`, 'x-csrf-token': token },
      });
      assert.equal(res.status, 200);
      const cookies = cookiesFrom(res);
      assert.equal(cookies['bo_session'], '');
      assert.equal(cookies['csrf'], '');
    });
  });

  await t.test('P6: POST /auth/logout sin CSRF válido ⇒ 403', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' });
      assert.equal(res.status, 403);
    });
  });

  await t.test('P8: callback de asesor con partner claim ACTIVO ⇒ sesión con partnerId/slug (007, D1/D2)', async () => {
    await withServer(
      baseDeps({
        exchangeAuthorizationCode: async () =>
          exchangeResult({
            sub: 'u-asesor-a',
            name: 'Asesor A',
            partner: 'banco-a',
          }),
        partnerRepository: stubPartnerRepository({ 'banco-a': stubPartner({ slug: 'banco-a' }) }),
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        assert.equal(callbackRes.status, 302);
        const sessionCookie = cookiesFrom(callbackRes)['bo_session'];
        assert.ok(sessionCookie);

        const sessionRes = await fetch(`${baseUrl}/admin/session`, {
          headers: { cookie: `bo_session=${sessionCookie}` },
        });
        assert.equal(sessionRes.status, 200);
        const body = (await sessionRes.json()) as { partnerId?: string; partnerSlug?: string; partnerKey?: string };
        // Solo `partnerSlug` cruza al cliente; `partnerId`/`partnerKey` quedan
        // sellados server-side y NO se exponen en la respuesta whoami.
        assert.equal(body.partnerSlug, 'banco-a');
        assert.equal(body.partnerId, undefined);
        assert.equal(body.partnerKey, undefined);
      },
    );
  });

  await t.test('P9: callback de asesor con partner INEXISTENTE ⇒ 302 /forbidden sin sesión (FR-008)', async () => {
    await withServer(
      baseDeps({
        exchangeAuthorizationCode: async () => exchangeResult({ sub: 'u-x', name: 'X', partner: 'banco-fantasma' }),
        partnerRepository: stubPartnerRepository({}),
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        assert.equal(callbackRes.status, 302);
        assert.equal(callbackRes.headers.get('location'), '/forbidden');
        assert.equal(cookiesFrom(callbackRes)['bo_session'], undefined);
      },
    );
  });

  await t.test('P10: callback de asesor con partner INACTIVO ⇒ 302 /forbidden sin sesión (FR-008)', async () => {
    await withServer(
      baseDeps({
        exchangeAuthorizationCode: async () => exchangeResult({ sub: 'u-y', name: 'Y', partner: 'banco-inactivo' }),
        partnerRepository: stubPartnerRepository({
          'banco-inactivo': stubPartner({ slug: 'banco-inactivo', status: 'inactive' }),
        }),
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        assert.equal(callbackRes.status, 302);
        assert.equal(callbackRes.headers.get('location'), '/forbidden');
        assert.equal(cookiesFrom(callbackRes)['bo_session'], undefined);
      },
    );
  });

  await t.test('P11: claim de partner ausente ⇒ sesión sin partner (no rompe el flujo admin de 006)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
      const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

      const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
        redirect: 'manual',
        headers: { cookie: `bo_oidc_tx=${txCookie}` },
      });
      const sessionCookie = cookiesFrom(callbackRes)['bo_session'];

      const sessionRes = await fetch(`${baseUrl}/admin/session`, {
        headers: { cookie: `bo_session=${sessionCookie}` },
      });
      const body = (await sessionRes.json()) as { partnerId?: string; partnerSlug?: string };
      assert.equal(body.partnerId, undefined);
      assert.equal(body.partnerSlug, undefined);
    });
  });

  await t.test('CT-01: login?module=<válido> ⇒ tras callback, 302 a la route del catálogo (FR-010)', async () => {
    await withServer(
      baseDeps({
        exchangeAuthorizationCode: async () =>
          exchangeResult({
            sub: 'u-1',
            name: 'Ana',
            realm_access: { roles: ['platform-admin'] },
          }),
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login?module=admin`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        assert.equal(callbackRes.status, 302);
        assert.equal(callbackRes.headers.get('location'), '/admin');
      },
    );
  });

  await t.test('CT-02: login?module=<inexistente> ⇒ callback 302 a /admin (fallback, FR-011)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/auth/login?module=no-existe`, { redirect: 'manual' });
      const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

      const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
        redirect: 'manual',
        headers: { cookie: `bo_oidc_tx=${txCookie}` },
      });
      assert.equal(callbackRes.status, 302);
      assert.equal(callbackRes.headers.get('location'), '/admin');
    });
  });

  // CT-03 (requiresPartner sin partner ⇒ fallback) se valida a nivel unitario en
  // module-catalog.test.ts: el catálogo real hoy solo tiene "admin" (sin
  // requiresPartner), por lo que no hay un módulo partner-gated que ejercitar
  // end-to-end en este router hasta que exista una página de journey (T018).

  await t.test('CT-04: module con requiredRoles sin intersección (sesión sin roles) ⇒ fallback (FR-011)', async () => {
    await withServer(
      baseDeps({
        exchangeAuthorizationCode: async () =>
          exchangeResult({
            sub: 'u-3',
            name: 'Caro',
            realm_access: { roles: [] },
          }),
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login?module=admin`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        assert.equal(callbackRes.status, 302);
        assert.equal(callbackRes.headers.get('location'), '/admin');
      },
    );
  });

  await t.test('CT-05: callback sin bo_oidc_tx ⇒ 302 /forbidden (FR-005)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, { redirect: 'manual' });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/forbidden');
    });
  });

  await t.test('CT-06: fallo del intercambio de código ⇒ 302 /forbidden sin bo_session (FR-005, SC-003)', async () => {
    await withServer(
      baseDeps({
        exchangeAuthorizationCode: async () => {
          throw new Error('exchange failed');
        },
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        assert.equal(callbackRes.status, 302);
        assert.equal(callbackRes.headers.get('location'), '/forbidden');
        assert.equal(cookiesFrom(callbackRes)['bo_session'], undefined);
      },
    );
  });

  await t.test('CT-07: ningún token del IdP aparece en texto plano en cookies ni cuerpo (SC-003)', async () => {
    await withServer(
      baseDeps({
        // El `access_token` se descarta; el `id_token` se retiene pero SELLADO
        // (cifrado) — ninguno debe aparecer en texto plano en la respuesta.
        exchangeAuthorizationCode: async () => ({
          claims: { sub: 'u-4', name: 'Deb', access_token: 'should-not-leak' },
          idToken: 'should-not-leak-idtoken',
        }),
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        const body = await callbackRes.text();
        // El access_token nunca se guarda; el id_token va cifrado dentro de
        // bo_session, así que tampoco aparece en texto plano (AEAD).
        assert.ok(!JSON.stringify(cookiesFrom(callbackRes)).includes('should-not-leak'));
        assert.ok(!body.includes('should-not-leak'));
      },
    );
  });

  await t.test('CT-08: login sin module ni returnTo ⇒ aterriza en /admin (compat)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
      const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

      const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=state-1`, {
        redirect: 'manual',
        headers: { cookie: `bo_oidc_tx=${txCookie}` },
      });
      assert.equal(callbackRes.status, 302);
      assert.equal(callbackRes.headers.get('location'), '/admin');
    });
  });

  await t.test('CT-11: POST /auth/logout expira cookies y produce URL de end_session_endpoint con id_token_hint (FR-014)', async () => {
    await withServer(
      baseDeps({
        postLogoutRedirectUri: 'https://webview-login.example.com',
        endSession: async ({ postLogoutRedirectUri, idTokenHint }) => {
          const url = new URL('https://idp.example.com/realms/backoffice/protocol/openid-connect/logout');
          url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
          if (idTokenHint) {
            url.searchParams.set('id_token_hint', idTokenHint);
          }
          return url;
        },
      }),
      async (baseUrl) => {
        // Sesión sellada con un id_token: el logout debe recuperarlo y pasarlo.
        const seal = baseDeps().sessionSeal;
        const iat = Math.floor(Date.now() / 1000);
        const boSession = seal.seal({ sub: 'u-9', name: 'Beto', roles: ['auditor'], idToken: 'the-id-token', iat, exp: iat + 3600 });
        const token = issueCsrfToken();
        const res = await fetch(`${baseUrl}/auth/logout`, {
          method: 'POST',
          headers: { cookie: `csrf=${token}; bo_session=${boSession}`, 'x-csrf-token': token },
        });
        assert.equal(res.status, 200);
        const cookies = cookiesFrom(res);
        assert.equal(cookies['bo_session'], '');
        assert.equal(cookies['csrf'], '');
        const body = (await res.json()) as { endSessionUrl?: string };
        assert.ok(body.endSessionUrl?.includes('post_logout_redirect_uri='));
        assert.ok(body.endSessionUrl?.includes(encodeURIComponent('https://webview-login.example.com')));
        assert.ok(body.endSessionUrl?.includes('id_token_hint=the-id-token'));
      },
    );
  });

  await t.test('CT-12/fail-safe: sin end_session disponible, las cookies locales igual expiran', async () => {
    await withServer(
      baseDeps({
        postLogoutRedirectUri: 'https://webview-login.example.com',
        endSession: async () => {
          throw new Error('IdP no disponible');
        },
      }),
      async (baseUrl) => {
        const token = issueCsrfToken();
        const res = await fetch(`${baseUrl}/auth/logout`, {
          method: 'POST',
          headers: { cookie: `csrf=${token}`, 'x-csrf-token': token },
        });
        assert.equal(res.status, 200);
        const cookies = cookiesFrom(res);
        assert.equal(cookies['bo_session'], '');
        assert.equal(cookies['csrf'], '');
      },
    );
  });

  await t.test('P7: callback con state inválido ⇒ falla segura, 302 a /forbidden sin sesión', async () => {
    await withServer(
      baseDeps({
        exchangeAuthorizationCode: async () => {
          throw new Error('state mismatch');
        },
      }),
      async (baseUrl) => {
        const loginRes = await fetch(`${baseUrl}/auth/login`, { redirect: 'manual' });
        const txCookie = cookiesFrom(loginRes)['bo_oidc_tx'];

        const callbackRes = await fetch(`${baseUrl}/auth/callback?code=abc&state=wrong`, {
          redirect: 'manual',
          headers: { cookie: `bo_oidc_tx=${txCookie}` },
        });
        assert.equal(callbackRes.status, 302);
        assert.equal(callbackRes.headers.get('location'), '/forbidden');
        const cookies = cookiesFrom(callbackRes);
        assert.equal(cookies['bo_session'], undefined);
      },
    );
  });
});
