/**
 * Fuente única del formato de `partnerKey`: un UUID (canónico 8-4-4-4-12).
 * Reutilizado por el servidor (validación del alta en `admin-router`) y por el
 * cliente (validador del formulario de creación de partner) para no duplicar el
 * patrón. Mismo estilo que `slug-validation.ts`.
 */
export const PARTNER_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `true` ⟺ `raw` tiene forma de UUID. No normaliza; solo valida. */
export function isValidPartnerKey(raw: string): boolean {
  return PARTNER_KEY_RE.test(raw);
}
