import { makeStateKey, type TransferState } from '@angular/core';

import { assertAllowedTransferStateWrite } from '../../../server/security/transfer-state-allowlist';

/** Clave tipada de TransferState para los slugs de partners activos resueltos en SSR (A7). */
export const PARTNERS_STATE_KEY = makeStateKey<string[]>('partners-active');

/**
 * SSR: persiste los slugs de partners activos ya resueltos para que el cliente
 * siembre la queryCache y `tenantMatch` no re-pida `GET /api/partners/active`
 * en la primera navegación (espeja el pipeline de theme/session). Refuerza
 * —server-side— vía la allowlist que solo un array de slugs cruza al cliente.
 */
export function writePartnersTransferState(transferState: TransferState, slugs: readonly string[]): void {
  const value = [...slugs];
  assertAllowedTransferStateWrite(PARTNERS_STATE_KEY.toString(), value);
  transferState.set(PARTNERS_STATE_KEY, value);
}

/** Cliente: lee los slugs transferidos por SSR, o `null` si no hay. */
export function readPartnersTransferState(transferState: TransferState): string[] | null {
  return transferState.get(PARTNERS_STATE_KEY, null);
}
