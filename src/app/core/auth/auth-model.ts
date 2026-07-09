export type AppRole = 'platform-admin' | 'partner-editor' | 'auditor';

export interface AuthUser {
  readonly subject: string;
  readonly name: string;
  readonly roles: readonly AppRole[];
  /** Presente ⟺ el usuario es un asesor vinculado a un único partner (007, D7). */
  readonly partnerId?: string;
  readonly partnerSlug?: string;
  /** UUID del partner para consumir servicios externos (009). Presente ⟺ asesor. */
  readonly partnerKey?: string;
}
