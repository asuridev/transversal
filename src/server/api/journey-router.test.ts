import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express, { type Request, type NextFunction } from 'express';
import type { AddressInfo } from 'node:net';

import { createJourneyRouter, type JourneyRouterDeps } from './journey-router.ts';
import { createSessionSeal, type SealedSession } from '../security/session-seal.ts';
import type { SecretResolver, IntegrationCreds } from '../secrets/secret-resolver.ts';

const key = randomBytes(32).toString('base64');
const seal = createSessionSeal({ key });

function fakeSecretResolver(creds: Record<string, IntegrationCreds | null>): SecretResolver {
  return {
    async resolve(slug: string) {
      return creds[slug] ?? null;
    },
    invalidate() {},
    async isConfigured(slug: string) {
      return (creds[slug] ?? null) !== null;
    },
  };
}

function sessionCookie(overrides: Partial<SealedSession> = {}): string {
  const iat = Math.floor(Date.now() / 1000);
  // `partnerKey` por defecto: las sesiones de asesor lo llevan sellado (009); el
  // BFF lo deriva de aquí, ya no del header `_p` del cliente. Las sesiones admin
  // (sin partnerId/slug) igual son rechazadas por `requirePartnerScope`.
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

function baseDeps(overrides: Partial<JourneyRouterDeps> = {}): JourneyRouterDeps {
  return {
    secretResolver: fakeSecretResolver({}),
    masheryAuthConfig: { authBaseUrl: 'http://mashery-auth.local' },
    contactInfoConfig: { customerBaseUrl: 'http://customer.local' },
    sessionSeal: seal,
    isActivePartner: async () => true,
    recordCrossPartnerDenied: async () => {},
    ...overrides,
  };
}

async function withServer(deps: JourneyRouterDeps, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next: NextFunction) => {
    req.requestId = 'test-request-id';
    next();
  });
  app.use('/journey', createJourneyRouter(deps));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('journey-router (007, aislamiento por partner)', async (t) => {
  await t.test('P1: sin sesión ⇒ 401', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/journey/banco-a/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      assert.equal(res.status, 401);
    });
  });

  await t.test('P2: sesión admin (sin partner) ⇒ 404', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie();
      const res = await fetch(`${baseUrl}/journey/banco-a/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
        body: '{}',
      });
      assert.equal(res.status, 404);
    });
  });

  await t.test('P3: asesor de banco-a operando banco-a ⇒ orquesta con el partner autoritativo', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: 'quoted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    try {
      await withServer(
        baseDeps({
          secretResolver: fakeSecretResolver({ 'banco-a': { baseUrl: 'http://mashery.local', apiKey: 'key-a' } }),
        }),
        async (baseUrl) => {
          const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
          const res = await fetch(`${baseUrl}/journey/banco-a/quote`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
            body: '{}',
          });
          assert.equal(res.status, 200);
          const body = (await res.json()) as { result: string };
          assert.equal(body.result, 'quoted');
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('P4: asesor de banco-a → banco-b ⇒ 404 + 1 evento de auditoría (sin fuga)', async () => {
    let calls = 0;
    let recordedSlug: string | undefined;
    await withServer(
      baseDeps({
        recordCrossPartnerDenied: async (event) => {
          calls += 1;
          recordedSlug = event.attemptedSlug;
        },
      }),
      async (baseUrl) => {
        const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
        const res = await fetch(`${baseUrl}/journey/banco-b/quote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
          body: '{}',
        });
        assert.equal(res.status, 404);
        const body = (await res.json()) as { code: string };
        assert.equal(body.code, 'not_found');
      },
    );
    assert.equal(calls, 1);
    assert.equal(recordedSlug, 'banco-b');
  });

  await t.test('P5: partner de la sesión ya no activo ⇒ 404', async () => {
    await withServer(baseDeps({ isActivePartner: async () => false }), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/journey/banco-a/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
        body: '{}',
      });
      assert.equal(res.status, 404);
    });
  });

  await t.test('P6: slug sintácticamente inválido ⇒ 400 invalid_input', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/journey/${encodeURIComponent('B@nco!')}/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
        body: '{}',
      });
      assert.equal(res.status, 400);
    });
  });

  await t.test('P7: partner en el body ⇒ ignorado; orquesta con el partner de la sesión (FR-005)', async () => {
    const originalFetch = globalThis.fetch;
    let calledBaseUrl = '';
    globalThis.fetch = (async (input: string | URL | Request) => {
      calledBaseUrl = String(input);
      return new Response(JSON.stringify({ result: 'quoted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    try {
      await withServer(
        baseDeps({
          secretResolver: fakeSecretResolver({
            'banco-a': { baseUrl: 'http://mashery.local/banco-a', apiKey: 'key-a' },
            'banco-b': { baseUrl: 'http://mashery.local/banco-b', apiKey: 'key-b' },
          }),
        }),
        async (baseUrl) => {
          const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
          const res = await fetch(`${baseUrl}/journey/banco-a/quote`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
            body: JSON.stringify({ partnerId: 'banco-b' }),
          });
          assert.equal(res.status, 200);
        },
      );
      assert.match(calledBaseUrl, /banco-a/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/**
 * Mock de la cadena real de Cardif (pasos 2, 3 y 1). Captura las llamadas
 * salientes para poder verificar URLs y headers reenviados.
 */
function stubCardifChain(options: { authorizationCustomerToken?: string | null } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const token = options.authorizationCustomerToken === undefined ? 'tok-customer' : options.authorizationCustomerToken;
  const passthrough = globalThis.fetch;

  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    // Solo interceptamos los hosts de Cardif; la llamada del cliente de prueba
    // al servidor Express local (127.0.0.1) pasa al fetch real.
    if (!url.includes('mashery-auth.local') && !url.includes('customer.local')) {
      return passthrough(input, init);
    }
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });

    if (url.includes('/v1/params/__j')) {
      return new Response(JSON.stringify({ bodyResponse: { paramj: 'paramj-xyz' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/v2/tokenRequest/jwt')) {
      const bodyResponse = [
        { name_api: 'AuthorizationCustomer', access_token: token, status_request: 200 },
        { name_api: 'AuthReferencials', access_token: 'tok-ref', status_request: 200 },
      ].filter((item) => item.access_token !== null);
      return new Response(JSON.stringify({ bodyResponse }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Paso 1 — contact_info.
    return new Response(
      JSON.stringify({
        responseHeader: { returnCode: 200, message: 'OK' },
        bodyResponse: { personalInformation: { documentType: 'CC', documentNumber: '10282664' }, totalElement: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  return { impl, calls };
}

test('journey-router: contact-info (KYC, cadena real Cardif)', async (t) => {
  await t.test('body válido + correlation-id ⇒ deriva partnerKey de la sesión, orquesta pasos 2/3/1 y devuelve el body de Cardif', async () => {
    const originalFetch = globalThis.fetch;
    const { impl, calls } = stubCardifChain();
    globalThis.fetch = impl;
    try {
      await withServer(baseDeps(), async (baseUrl) => {
        const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
        const res = await fetch(`${baseUrl}/journey/banco-a/contact-info`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `bo_session=${cookie}`,
            'x-correlation-id': 'corr-123',
          },
          body: JSON.stringify({ documentType: 'CC', documentNumber: '10282664' }),
        });
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
          responseHeader: { returnCode: number };
          bodyResponse: { personalInformation: { documentType: string; documentNumber: string } };
        };
        assert.equal(body.responseHeader.returnCode, 200);
        assert.equal(body.bodyResponse.personalInformation.documentNumber, '10282664');
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Las tres llamadas salientes, en orden, con los headers reenviados.
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/v1\/params\/__j$/);
    assert.equal(calls[0].headers['_p'], 'partner-key-a');
    assert.equal(calls[0].headers['correlation-id'], 'corr-123');

    assert.match(calls[1].url, /\/v2\/tokenRequest\/jwt\?api=CU,REF,DS,SEC$/);
    assert.equal(calls[1].headers['__j'], 'paramj-xyz');
    assert.equal(calls[1].headers['_p'], 'partner-key-a');

    assert.match(calls[2].url, /\/customer\/v1\/external\/contact_info\?/);
    assert.match(calls[2].url, /customerDocumentType=CC/);
    assert.match(calls[2].url, /customerDocumentNumber=10282664/);
    assert.equal(calls[2].headers['__j'], 'paramj-xyz');
    assert.equal(calls[2].headers['authorization'], 'Bearer tok-customer');
    assert.equal(calls[2].headers['correlation-id'], 'corr-123');
  });

  await t.test('sesión de asesor sin partnerKey ⇒ 404 (sesión no operable)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a', partnerKey: undefined });
      const res = await fetch(`${baseUrl}/journey/banco-a/contact-info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
        body: JSON.stringify({ documentType: 'CC', documentNumber: '10282664' }),
      });
      assert.equal(res.status, 404);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'not_found');
    });
  });

  await t.test('paso 3 sin token AuthorizationCustomer ⇒ 502 mashery_error', async () => {
    const originalFetch = globalThis.fetch;
    const { impl } = stubCardifChain({ authorizationCustomerToken: null });
    globalThis.fetch = impl;
    try {
      await withServer(baseDeps(), async (baseUrl) => {
        const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
        const res = await fetch(`${baseUrl}/journey/banco-a/contact-info`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `bo_session=${cookie}`,
            'x-correlation-id': 'corr-123',
          },
          body: JSON.stringify({ documentType: 'CC', documentNumber: '10282664' }),
        });
        assert.equal(res.status, 502);
        const body = (await res.json()) as { code: string };
        assert.equal(body.code, 'mashery_error');
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('sin documentType ⇒ 400 invalid_input', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/journey/banco-a/contact-info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
        body: JSON.stringify({ documentNumber: '10282664' }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'invalid_input');
    });
  });

  await t.test('sin documentNumber ⇒ 400 invalid_input', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/journey/banco-a/contact-info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
        body: JSON.stringify({ documentType: 'CC' }),
      });
      assert.equal(res.status, 400);
    });
  });

  await t.test('sin sesión ⇒ 401 (protección heredada de requirePartnerScope)', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/journey/banco-a/contact-info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentType: 'CC', documentNumber: '10282664' }),
      });
      assert.equal(res.status, 401);
    });
  });

  await t.test('cruce entre partners (slug URL ≠ partner de sesión) ⇒ 404', async () => {
    await withServer(baseDeps(), async (baseUrl) => {
      const cookie = sessionCookie({ partnerId: 'p-a', partnerSlug: 'banco-a' });
      const res = await fetch(`${baseUrl}/journey/banco-b/contact-info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bo_session=${cookie}` },
        body: JSON.stringify({ documentType: 'CC', documentNumber: '10282664' }),
      });
      assert.equal(res.status, 404);
    });
  });
});
