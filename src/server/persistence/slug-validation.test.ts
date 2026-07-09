import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateNewPartnerSlug } from './slug-validation.ts';

describe('validateNewPartnerSlug', () => {
  it('accepts a well-formed, non-reserved slug', () => {
    const result = validateNewPartnerSlug('popular');
    assert.deepEqual(result, { ok: true, slug: 'popular' });
  });

  it('rejects invalid format', () => {
    const result = validateNewPartnerSlug('pop!ular');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'invalid-format');
  });

  it('rejects a reserved segment', () => {
    const result = validateNewPartnerSlug('admin');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, 'reserved');
      assert.equal(result.error.area, 'admin');
    }
  });
});
