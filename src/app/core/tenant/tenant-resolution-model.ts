export interface TenantInput {
  readonly pathname: string;
  readonly host?: string;
}

export type ReservedArea = 'admin' | 'api' | 'assets' | 'static' | 'health' | 'system';
export type FallbackReason = 'unknown-slug' | 'inactive';

export type TenantResolution =
  | { readonly kind: 'partner'; readonly slug: string }
  | { readonly kind: 'reserved'; readonly area: ReservedArea }
  | { readonly kind: 'root' }
  | { readonly kind: 'fallback'; readonly reason: FallbackReason };
