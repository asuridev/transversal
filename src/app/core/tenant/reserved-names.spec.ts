import { isReservedSegment, RESERVED_NAMES } from './reserved-names';

describe('RESERVED_NAMES / isReservedSegment', () => {
  it('contains the expected reserved names', () => {
    expect(RESERVED_NAMES.has('admin')).toBeTrue();
    expect(RESERVED_NAMES.has('api')).toBeTrue();
    expect(RESERVED_NAMES.has('assets')).toBeTrue();
    expect(RESERVED_NAMES.has('static')).toBeTrue();
    expect(RESERVED_NAMES.has('health')).toBeTrue();
    expect(RESERVED_NAMES.has('_next')).toBeTrue();
    expect(RESERVED_NAMES.has('favicon.ico')).toBeTrue();
    expect(RESERVED_NAMES.has('robots.txt')).toBeTrue();
  });

  it('recognizes an exact reserved segment', () => {
    expect(isReservedSegment('admin')).toBe('admin');
  });

  it('is case-insensitive ("API")', () => {
    expect(isReservedSegment('API')).toBe('api');
  });

  it('is case-insensitive ("Admin")', () => {
    expect(isReservedSegment('Admin')).toBe('admin');
  });

  it('recognizes non-slug-charset reserved names ("favicon.ico")', () => {
    expect(isReservedSegment('favicon.ico')).toBe('system');
  });

  it('maps each reserved name to its correct area', () => {
    expect(isReservedSegment('assets')).toBe('assets');
    expect(isReservedSegment('static')).toBe('static');
    expect(isReservedSegment('health')).toBe('health');
    expect(isReservedSegment('_next')).toBe('system');
    expect(isReservedSegment('robots.txt')).toBe('system');
  });

  it('returns null for a non-reserved segment', () => {
    expect(isReservedSegment('popular')).toBeNull();
  });
});
