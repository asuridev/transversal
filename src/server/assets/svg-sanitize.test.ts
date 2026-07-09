import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSvg, isSvgDangerous } from './svg-sanitize.ts';

describe('sanitizeSvg / isSvgDangerous', () => {
  it('elimina bloques <script>', () => {
    const dirty = '<svg><script>alert(1)</script><circle r="1"/></svg>';
    const clean = sanitizeSvg(dirty);
    assert.ok(!/<script/i.test(clean));
    assert.ok(!isSvgDangerous(clean));
  });

  it('elimina atributos on* peligrosos', () => {
    const dirty = '<svg onload="alert(1)"><rect onclick="hack()" /></svg>';
    const clean = sanitizeSvg(dirty);
    assert.ok(!/\son\w+\s*=/i.test(clean));
    assert.ok(!isSvgDangerous(clean));
  });

  it('elimina href con esquema javascript:', () => {
    const dirty = '<svg><a href="javascript:alert(1)"><rect/></a></svg>';
    const clean = sanitizeSvg(dirty);
    assert.ok(!/javascript:/i.test(clean));
    assert.ok(!isSvgDangerous(clean));
  });

  it('un SVG limpio se marca como no peligroso', () => {
    const safe = '<svg><circle r="1" fill="#000"/></svg>';
    assert.equal(isSvgDangerous(safe), false);
    assert.equal(sanitizeSvg(safe), safe);
  });
});
