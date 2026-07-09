import { resolveTenant } from './resolve-tenant';
import { TenantResolution } from './tenant-resolution-model';

describe('resolveTenant', () => {
  const activeSlugs: ReadonlySet<string> = new Set(['popular', 'otrobanco']);

  const cases: Array<[string, string, TenantResolution]> = [
    ['/popular/oferta', '#1 active partner, nested path', { kind: 'partner', slug: 'popular' }],
    ['/popular/beneficiarios', '#2 active partner, another nested path', { kind: 'partner', slug: 'popular' }],
    ['/otrobanco', '#3 another active partner', { kind: 'partner', slug: 'otrobanco' }],
    ['/', '#4 root (slash)', { kind: 'root' }],
    ['', "#5 root (empty string)", { kind: 'root' }],
    ['/admin', '#6 reserved admin', { kind: 'reserved', area: 'admin' }],
    ['/api/theme/popular', '#7 reserved api (nested)', { kind: 'reserved', area: 'api' }],
    ['/Admin', '#8 reserved, case-insensitive', { kind: 'reserved', area: 'admin' }],
    ['/favicon.ico', '#9 reserved, non-slug charset', { kind: 'reserved', area: 'system' }],
    ['/no-existe/x', '#10 unknown slug', { kind: 'fallback', reason: 'unknown-slug' }],
    ['/inactivo', '#11 inactive (indistinguishable from unknown)', { kind: 'fallback', reason: 'unknown-slug' }],
    ['/Popular', '#12 uppercase normalizes to active partner', { kind: 'partner', slug: 'popular' }],
    ['/ popular ', '#13 whitespace trims to active partner', { kind: 'partner', slug: 'popular' }],
    ['/pop!ular', '#14 invalid charset', { kind: 'fallback', reason: 'unknown-slug' }],
    ['/a', '#15 length below minimum', { kind: 'fallback', reason: 'unknown-slug' }],
    [`/${'a'.repeat(41)}`, '#16 length above maximum', { kind: 'fallback', reason: 'unknown-slug' }],
  ];

  for (const [pathname, description, expected] of cases) {
    it(`${description}: "${pathname}" -> ${JSON.stringify(expected)}`, () => {
      expect(resolveTenant({ pathname }, activeSlugs)).toEqual(expected);
    });
  }

  it('is deterministic and idempotent for the same input', () => {
    const input = { pathname: '/popular/oferta' };
    const first = resolveTenant(input, activeSlugs);
    const second = resolveTenant(input, activeSlugs);
    expect(first).toEqual(second);
  });
});
