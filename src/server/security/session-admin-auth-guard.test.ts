import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { createSessionSeal, type SealedSession } from './session-seal.ts';
import { createSessionAdminAuthGuard } from './admin-auth-guard.ts';

const key = randomBytes(32).toString('base64');

function cookieHeaderFor(session: SealedSession, seal = createSessionSeal({ key })): string {
  return `bo_session=${seal.seal(session)}; csrf=abc`;
}

test('createSessionAdminAuthGuard', async (t) => {
  await t.test('P1: cookie bo_session válida ⇒ AdminSession {subject,name,roles}', async () => {
    const seal = createSessionSeal({ key });
    const guard = createSessionAdminAuthGuard({ unseal: seal.unseal });
    const iat = Math.floor(Date.now() / 1000);
    const session = { sub: 'u-1', name: 'Ana', roles: ['partner-editor'], iat, exp: iat + 3600 };

    const result = await guard.authorize({ headers: { cookie: cookieHeaderFor(session, seal) } });
    assert.deepEqual(result, { subject: 'u-1', name: 'Ana', roles: ['partner-editor'] });
  });

  await t.test('P2: sin cookie ⇒ throw (401)', async () => {
    const seal = createSessionSeal({ key });
    const guard = createSessionAdminAuthGuard({ unseal: seal.unseal });
    await assert.rejects(() => guard.authorize({ headers: {} }));
  });

  await t.test('P3: cookie expirada ⇒ throw (401)', async () => {
    const seal = createSessionSeal({ key });
    const guard = createSessionAdminAuthGuard({ unseal: seal.unseal });
    const iat = Math.floor(Date.now() / 1000) - 7200;
    const session = { sub: 'u-1', name: 'Ana', roles: [], iat, exp: iat + 3600 };
    await assert.rejects(() =>
      guard.authorize({ headers: { cookie: cookieHeaderFor(session, seal) } }),
    );
  });

  await t.test('P4: cookie inválida/manipulada ⇒ throw (401)', async () => {
    const seal = createSessionSeal({ key });
    const guard = createSessionAdminAuthGuard({ unseal: seal.unseal });
    await assert.rejects(() => guard.authorize({ headers: { cookie: 'bo_session=not-valid' } }));
  });
});
