import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSecretResolver } from './env-secret-resolver.ts';

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test('EnvSecretResolver', async (t) => {
  await t.test('P1: resuelve apiKey por slug y baseUrl de Mashery', async () => {
    await withEnv(
      {
        MASHERY_BASEURL: 'http://mashery.local',
        PARTNER_BANCO_POPULAR_APIKEY: 'key-a',
      },
      async () => {
        const resolver = createSecretResolver();
        const creds = await resolver.resolve('banco-popular');
        assert.deepEqual(creds, { baseUrl: 'http://mashery.local', apiKey: 'key-a' });
      },
    );
  });

  await t.test('P2: devuelve null si el partner no tiene apiKey configurada', async () => {
    await withEnv({ MASHERY_BASEURL: 'http://mashery.local' }, async () => {
      const resolver = createSecretResolver();
      const creds = await resolver.resolve('sin-configurar');
      assert.equal(creds, null);
    });
  });

  await t.test('P2b: sin MASHERY_BASEURL, todos los partners resuelven null aunque tengan apiKey', async () => {
    await withEnv({ PARTNER_BANCO_POPULAR_APIKEY: 'key-a' }, async () => {
      const resolver = createSecretResolver();
      const creds = await resolver.resolve('banco-popular');
      assert.equal(creds, null);
    });
  });

  await t.test('P3: isConfigured devuelve boolean sin revelar el valor', async () => {
    await withEnv(
      { MASHERY_BASEURL: 'http://mashery.local', PARTNER_OCCIDENTE_APIKEY: 'key-b' },
      async () => {
        const resolver = createSecretResolver();
        assert.equal(await resolver.isConfigured('occidente'), true);
        assert.equal(await resolver.isConfigured('sin-configurar'), false);
      },
    );
  });

  await t.test('P4: el apiKey nunca se serializa (JSON.stringify de isConfigured no lo expone)', async () => {
    await withEnv(
      { MASHERY_BASEURL: 'http://mashery.local', PARTNER_OCCIDENTE_APIKEY: 'super-secret' },
      async () => {
        const resolver = createSecretResolver();
        const configured = await resolver.isConfigured('occidente');
        const serialized = JSON.stringify({ configured });
        assert.ok(!serialized.includes('super-secret'));
      },
    );
  });

  await t.test('P5: rotación — invalidate(slug) fuerza relectura inmediata (sin esperar TTL)', async () => {
    await withEnv({ MASHERY_BASEURL: 'http://mashery.local', PARTNER_ROTABLE_APIKEY: 'key-old' }, async () => {
      const resolver = createSecretResolver(60_000);
      const first = await resolver.resolve('rotable');
      assert.equal(first?.apiKey, 'key-old');

      process.env['PARTNER_ROTABLE_APIKEY'] = 'key-new';
      const stillCached = await resolver.resolve('rotable');
      assert.equal(stillCached?.apiKey, 'key-old', 'dentro del TTL debe seguir sirviendo el valor cacheado');

      resolver.invalidate('rotable');
      const rotated = await resolver.resolve('rotable');
      assert.equal(rotated?.apiKey, 'key-new', 'tras invalidate debe releer el valor nuevo, sin redeploy');
    });
  });

  await t.test('P6: rotación — tras la ventana de TTL, la siguiente resolución relee sin invalidate explícito', async () => {
    await withEnv({ MASHERY_BASEURL: 'http://mashery.local', PARTNER_TTLWIN_APIKEY: 'key-a' }, async () => {
      const resolver = createSecretResolver(10);
      const first = await resolver.resolve('ttlwin');
      assert.equal(first?.apiKey, 'key-a');

      process.env['PARTNER_TTLWIN_APIKEY'] = 'key-b';
      await new Promise((resolve) => setTimeout(resolve, 20));

      const afterWindow = await resolver.resolve('ttlwin');
      assert.equal(afterWindow?.apiKey, 'key-b');
    });
  });

  await t.test('P7: dos partners comparten el mismo Mashery pero resuelven su propio apiKey', async () => {
    await withEnv(
      {
        MASHERY_BASEURL: 'http://mashery.local',
        PARTNER_BANCO_POPULAR_APIKEY: 'key-a',
        PARTNER_OCCIDENTE_APIKEY: 'key-b',
      },
      async () => {
        const resolver = createSecretResolver();
        const bancoPopular = await resolver.resolve('banco-popular');
        const occidente = await resolver.resolve('occidente');

        assert.equal(bancoPopular?.baseUrl, occidente?.baseUrl);
        assert.notEqual(bancoPopular?.apiKey, occidente?.apiKey);
      },
    );
  });
});
