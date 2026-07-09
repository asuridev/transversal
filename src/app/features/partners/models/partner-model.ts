export type PartnerSlug = string;
export type PartnerStatus = 'active' | 'inactive';

export interface Partner {
  readonly slug: PartnerSlug;
  readonly status: PartnerStatus;
  readonly displayName?: string;
}
