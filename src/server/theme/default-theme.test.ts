import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultPublicTheme, DEFAULT_PARTNER_SLUG } from './default-theme.ts';

describe('getDefaultPublicTheme', () => {
  it('tiene el shape estándar de PublicTheme', () => {
    const theme = getDefaultPublicTheme();
    assert.deepEqual(
      Object.keys(theme).sort(),
      ['assets', 'displayName', 'legal', 'slug', 'tokens', 'typography', 'version'].sort(),
    );
  });

  it('no expone datos de un banco real (slug de sistema)', () => {
    const theme = getDefaultPublicTheme();
    assert.equal(theme.slug, DEFAULT_PARTNER_SLUG);
    assert.notEqual(theme.displayName.toLowerCase(), 'banco popular');
    assert.notEqual(theme.displayName.toLowerCase(), 'banco de occidente');
  });
});
