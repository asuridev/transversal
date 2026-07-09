export type PartnerStatus = 'active' | 'inactive';

export interface Partner {
  id: string;
  slug: string;
  /** UUID que identifica al partner ante servicios externos (nunca en URL). */
  partnerKey: string;
  displayName: string;
  status: PartnerStatus;
  themeId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface NewPartner {
  slug: string;
  partnerKey: string;
  displayName: string;
  createdBy: string;
}

export interface PartnerQuery {
  status?: PartnerStatus;
  limit?: number;
  offset?: number;
}
