import { parseCookies } from './cookie-utils.ts';
import type { SealedSession } from './session-seal.ts';

export interface AdminSession {
  readonly subject: string;
  readonly name: string;
  readonly roles: readonly string[];
  /** Presente ⟺ sesión de asesor (007, D2) — ausente en sesiones de admin de Back Office. */
  readonly partnerId?: string;
  readonly partnerSlug?: string;
}

export interface AdminAuthGuard {
  /** Autoriza (devuelve la sesión) o rechaza. Sin sesión válida → rechazo (FR-015). */
  authorize(req: { headers: Readonly<Record<string, string | string[] | undefined>> }): Promise<AdminSession>;
}

/**
 * Adaptador V1 **default-deny**: sin mecanismo de identidad/SSO real (seam de
 * PRD 06), rechaza toda request admin. PRD 06 conecta el verificador real
 * implementando este mismo puerto, sin tocar los handlers de `admin-router`.
 */
export function createAdminAuthGuard(): AdminAuthGuard {
  return {
    async authorize(): Promise<AdminSession> {
      throw new Error('unauthorized: no admin identity mechanism configured (seam — PRD 06)');
    },
  };
}

/**
 * Adaptador real: desella la cookie `bo_session` (D2) y valida su vigencia.
 * Implementa el mismo puerto `AdminAuthGuard` — `admin-router.ts` no cambia
 * su forma de autorizar (D6).
 */
export function createSessionAdminAuthGuard(deps: {
  unseal: (raw: string) => SealedSession | null;
}): AdminAuthGuard {
  return {
    async authorize(req): Promise<AdminSession> {
      const cookieHeader = req.headers['cookie'];
      const raw = parseCookies(typeof cookieHeader === 'string' ? cookieHeader : undefined)['bo_session'];
      const session = raw ? deps.unseal(raw) : null;
      if (!session) {
        throw new Error('unauthorized: sesión ausente, expirada o inválida');
      }
      return {
        subject: session.sub,
        name: session.name,
        roles: session.roles,
        ...(session.partnerId !== undefined ? { partnerId: session.partnerId } : {}),
        ...(session.partnerSlug !== undefined ? { partnerSlug: session.partnerSlug } : {}),
      };
    },
  };
}
