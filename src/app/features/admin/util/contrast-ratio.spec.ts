import { contrastRatio, meetsAA } from './contrast-ratio';

describe('contrast-ratio', () => {
  it('black/white gives the maximum ratio (21)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('a color against itself gives ratio 1', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('tolerates missing/invalid colors (theme parcial) sin lanzar, devolviendo 21', () => {
    const missing = null as unknown as string;
    expect(() => contrastRatio(missing, '#ffffff')).not.toThrow();
    expect(contrastRatio(missing, '#ffffff')).toBe(21);
    expect(contrastRatio('#fff', undefined as unknown as string)).toBe(21);
    expect(contrastRatio('not-a-hex', '#000000')).toBe(21);
    expect(meetsAA(contrastRatio(missing, '#ffffff'))).toBe(true);
  });

  it('mid-grey vs white fails AA (normal text)', () => {
    const ratio = contrastRatio('#999999', '#ffffff');
    expect(meetsAA(ratio)).toBe(false);
  });

  it('black vs white passes AA (normal and large text)', () => {
    const ratio = contrastRatio('#000000', '#ffffff');
    expect(meetsAA(ratio)).toBe(true);
    expect(meetsAA(ratio, true)).toBe(true);
  });

  it('meetsAA uses a lower 3.0 threshold for large text', () => {
    // ratio ~3.95 (grey #808080 vs white): fails normal (4.5) but passes large (3.0)
    const ratio = contrastRatio('#808080', '#ffffff');
    expect(meetsAA(ratio, false)).toBe(false);
    expect(meetsAA(ratio, true)).toBe(true);
  });
});
