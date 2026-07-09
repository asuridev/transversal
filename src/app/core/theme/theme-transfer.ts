import { makeStateKey, type TransferState } from '@angular/core';

import type { PublicTheme } from '../../../shared/partner/public-theme-model';
import { assertAllowedTransferStateWrite } from '../../../server/security/transfer-state-allowlist';

/** Clave tipada de TransferState para el theme resuelto en SSR (contract theme-transfer §2). */
export const THEME_STATE_KEY = makeStateKey<PublicTheme>('theme');

/**
 * SSR: persiste el theme ya resuelto para que el cliente lo lea sin re-fetch
 * (FR-007/014). Refuerza —server-side— vía la allowlist que solo `PublicTheme`
 * cruza al cliente (FR-022).
 */
export function writeThemeTransferState(transferState: TransferState, theme: PublicTheme): void {
  assertAllowedTransferStateWrite(THEME_STATE_KEY.toString(), theme);
  transferState.set(THEME_STATE_KEY, theme);
}

/** Cliente: lee el theme transferido por SSR, o `null` si no hay (nunca ocurre en producción SSR). */
export function readThemeTransferState(transferState: TransferState): PublicTheme | null {
  return transferState.get(THEME_STATE_KEY, null);
}
