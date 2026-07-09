const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

export function normalizeSlug(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  return SLUG_PATTERN.test(normalized) ? normalized : null;
}
