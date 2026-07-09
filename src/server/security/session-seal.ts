import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { AppRole } from './role-map.ts';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Payload sellado en la cookie `bo_session` (AEAD, D2). `partnerId`/`partnerSlug`
 * son opcionales — presentes ⟺ sesión de asesor (007, D2); ausentes en sesiones
 * de admin de Back Office. El `access_token` del IdP NUNCA se guarda (FR-002).
 */
export interface SealedSession {
  readonly sub: string;
  readonly name: string;
  readonly roles: AppRole[];
  readonly partnerId?: string;
  readonly partnerSlug?: string;
  /** UUID del partner para consumir servicios externos (007/009). Presente ⟺ asesor. */
  readonly partnerKey?: string;
  /**
   * `id_token` original del IdP, retenido SOLO como `id_token_hint` del
   * RP-initiated logout con Keycloak < 19 (que no acepta `client_id` como
   * validador del `post_logout_redirect_uri`). Excepción consciente a FR-002:
   * queda cifrado (AEAD) y JAMÁS se expone al cliente — no cruza a
   * `AuthUser`/TransferState ni a `GET /api/admin/session`.
   */
  readonly idToken?: string;
  readonly iat: number; // epoch s
  readonly exp: number; // epoch s
}

export interface SessionSeal {
  seal(session: SealedSession): string;
  unseal(raw: string): SealedSession | null;
}

/** Sella cualquier payload JSON con AES-256-GCM (`node:crypto`, cero deps) — reusado por `bo_session`/`bo_oidc_tx`. */
export function sealJson<T>(payload: T, key: string): string {
  const keyBuffer = Buffer.from(key, 'base64');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

/** Desella un payload sellado por `sealJson`; inválido/manipulado ⇒ `null` (nunca lanza). */
export function unsealJson<T>(raw: string, key: string): T | null {
  try {
    const keyBuffer = Buffer.from(key, 'base64');
    const buffer = Buffer.from(raw, 'base64url');
    if (buffer.length < IV_LENGTH + 16) {
      return null;
    }
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = buffer.subarray(IV_LENGTH + 16);

    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8')) as T;
  } catch {
    return null;
  }
}

/** `seal`/`unseal` de `SealedSession` — D2. `key` en base64 (32 bytes). Valida `exp` al desellar. */
export function createSessionSeal(deps: { key: string; now?: () => number }): SessionSeal {
  const now = deps.now ?? Date.now;

  return {
    seal(session: SealedSession): string {
      return sealJson(session, deps.key);
    },

    unseal(raw: string): SealedSession | null {
      const session = unsealJson<SealedSession>(raw, deps.key);
      if (!session || session.exp * 1000 <= now()) {
        return null;
      }
      return session;
    },
  };
}
