import { makeStateKey, type TransferState } from '@angular/core';

import type { AuthUser } from './auth-model';
import { assertAllowedTransferStateWrite } from '../../../server/security/transfer-state-allowlist';

/** Clave tipada de TransferState para la sesión resuelta en SSR (007, bugs 2/4). */
export const SESSION_STATE_KEY = makeStateKey<AuthUser>('session');

/**
 * SSR: persiste la sesión ya resuelta (desellada de `bo_session`) para que el
 * cliente siembre el `AuthStore` **antes** de que corran los guards, sin un
 * round-trip a `/api/admin/session`. Refuerza —server-side— vía la allowlist
 * que solo la forma de `AuthUser` cruza al cliente (paridad con el theme,
 * FR-022): nunca el token del IdP ni ningún secreto.
 */
export function writeSessionTransferState(transferState: TransferState, user: AuthUser): void {
  assertAllowedTransferStateWrite(SESSION_STATE_KEY.toString(), user);
  transferState.set(SESSION_STATE_KEY, user);
}

/** Cliente: lee la sesión transferida por SSR, o `null` si el usuario es anónimo. */
export function readSessionTransferState(transferState: TransferState): AuthUser | null {
  return transferState.get(SESSION_STATE_KEY, null);
}
