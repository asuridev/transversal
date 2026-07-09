import type { ReservedArea } from './tenant-resolution-model';

// Single source of truth for reserved first-path-segments. Also reused by the
// Back Office slug-alta validation (FR-012, PRD 05) — do not duplicate.
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'assets',
  'static',
  'health',
  '_next',
  'favicon.ico',
  'robots.txt',
]);

const RESERVED_AREAS: Readonly<Record<string, ReservedArea>> = {
  admin: 'admin',
  api: 'api',
  assets: 'assets',
  static: 'static',
  health: 'health',
  _next: 'system',
  'favicon.ico': 'system',
  'robots.txt': 'system',
};

export function isReservedSegment(rawSegment: string): ReservedArea | null {
  const lowered = rawSegment.toLowerCase();
  return RESERVED_NAMES.has(lowered) ? RESERVED_AREAS[lowered] : null;
}
