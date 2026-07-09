import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRateLimiter } from './rate-limit.ts';

interface FakeRes {
  statusCode?: number;
  body?: unknown;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function fakeReq(ip: string, path: string): { ip: string; path: string; requestId: string } {
  return { ip, path, requestId: 'req-1' };
}

test('rate-limit', async (t) => {
  await t.test('P1: tráfico normal (bajo el umbral) no se ve afectado', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
    let nextCalls = 0;
    for (let i = 0; i < 5; i++) {
      limiter(fakeReq('1.2.3.4', '/api/theme/x') as never, fakeRes() as never, () => {
        nextCalls++;
      });
    }
    assert.equal(nextCalls, 5);
  });

  await t.test('P2: una ráfaga por encima del umbral responde 429 rate_limited', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
    const req = fakeReq('5.6.7.8', '/api/partners/active');
    let blocked: FakeRes | undefined;
    for (let i = 0; i < 5; i++) {
      const res = fakeRes();
      limiter(req as never, res as never, () => {});
      if (res.statusCode === 429) {
        blocked = res;
      }
    }
    assert.ok(blocked, 'esperaba al menos una respuesta 429');
    assert.equal((blocked!.body as { code: string }).code, 'rate_limited');
  });

  await t.test('P3: el límite se cuenta por IP+ruta (otra IP no se ve afectada)', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    limiter(fakeReq('9.9.9.9', '/api/theme/x') as never, fakeRes() as never, () => {});
    limiter(fakeReq('9.9.9.9', '/api/theme/x') as never, fakeRes() as never, () => {});
    const res3 = fakeRes();
    limiter(fakeReq('9.9.9.9', '/api/theme/x') as never, res3 as never, () => {});
    assert.equal(res3.statusCode, 429);

    let nextCalledForOtherIp = false;
    limiter(fakeReq('1.1.1.1', '/api/theme/x') as never, fakeRes() as never, () => {
      nextCalledForOtherIp = true;
    });
    assert.ok(nextCalledForOtherIp);
  });
});
