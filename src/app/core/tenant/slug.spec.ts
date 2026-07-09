import { normalizeSlug } from './slug';

describe('normalizeSlug', () => {
  it('lowercases the input', () => {
    expect(normalizeSlug('Popular')).toBe('popular');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSlug(' popular ')).toBe('popular');
  });

  it('rejects invalid charset', () => {
    expect(normalizeSlug('pop!ular')).toBeNull();
  });

  it('rejects length below the minimum (2)', () => {
    expect(normalizeSlug('a')).toBeNull();
  });

  it('accepts length at the minimum boundary (2)', () => {
    expect(normalizeSlug('ab')).toBe('ab');
  });

  it('rejects length above the maximum (40)', () => {
    expect(normalizeSlug('a'.repeat(41))).toBeNull();
  });

  it('accepts length at the maximum boundary (40)', () => {
    expect(normalizeSlug('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('never throws', () => {
    expect(() => normalizeSlug('')).not.toThrow();
  });
});
