const THEME_TRANSFER_STATE_KEY = 'theme';
const SESSION_TRANSFER_STATE_KEY = 'session';
const PARTNERS_TRANSFER_STATE_KEY = 'partners-active';

const REQUIRED_PUBLIC_THEME_KEYS: ReadonlySet<string> = new Set([
  'slug',
  'displayName',
  'version',
  'tokens',
  'assets',
  'legal',
  'typography',
]);

// Forma de `AuthUser` (auth-model.ts): subject/name/roles requeridos;
// partnerId/partnerSlug opcionales. Ningún otro campo puede cruzar (007).
const REQUIRED_SESSION_KEYS: ReadonlySet<string> = new Set(['subject', 'name', 'roles']);
const OPTIONAL_SESSION_KEYS: ReadonlySet<string> = new Set(['partnerId', 'partnerSlug', 'partnerKey']);

function assertObject(key: string, value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`transfer-state-allowlist: el valor de "${key}" debe ser un objeto ${label}`);
  }
}

function assertExactKeys(
  key: string,
  value: Record<string, unknown>,
  required: ReadonlySet<string>,
  optional: ReadonlySet<string> = new Set(),
): void {
  const actualKeys = Object.keys(value);

  for (const req of required) {
    if (!actualKeys.includes(req)) {
      throw new Error(`transfer-state-allowlist: falta el campo requerido "${req}" en "${key}"`);
    }
  }

  for (const actual of actualKeys) {
    if (!required.has(actual) && !optional.has(actual)) {
      throw new Error(`transfer-state-allowlist: campo no permitido "${actual}" en "${key}"`);
    }
  }
}

/**
 * Valida —server-side— que solo las claves/formas permitidas puedan escribirse
 * en `TransferState` antes de cruzar al cliente (FR-022): `theme` (PublicTheme)
 * y `session` (AuthUser). Lanza si la clave no está permitida o si el valor trae
 * campos ajenos/faltantes (p. ej. un secreto colado).
 */
export function assertAllowedTransferStateWrite(key: string, value: unknown): void {
  if (key === THEME_TRANSFER_STATE_KEY) {
    assertObject(key, value, 'PublicTheme');
    assertExactKeys(key, value, REQUIRED_PUBLIC_THEME_KEYS);
    return;
  }

  if (key === SESSION_TRANSFER_STATE_KEY) {
    assertObject(key, value, 'AuthUser');
    assertExactKeys(key, value, REQUIRED_SESSION_KEYS, OPTIONAL_SESSION_KEYS);
    return;
  }

  if (key === PARTNERS_TRANSFER_STATE_KEY) {
    // Slugs públicos de partners activos (A7): solo un array de strings puede
    // cruzar; ningún objeto/secreto.
    if (!Array.isArray(value) || value.some((slug) => typeof slug !== 'string')) {
      throw new Error(`transfer-state-allowlist: el valor de "${key}" debe ser un array de strings`);
    }
    return;
  }

  throw new Error(`transfer-state-allowlist: clave no permitida "${key}"`);
}
