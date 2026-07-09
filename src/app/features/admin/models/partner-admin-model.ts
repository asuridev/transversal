import type { AssetSlotSlug } from '../../../../shared/partner/asset-slots';
import type { Partner, PartnerStatus } from '../../../../shared/partner/partner-model';
import type {
  PartnerTheme,
  ThemeAssets,
  ThemeLegal,
  ThemeTokens,
  ThemeTypography,
} from '../../../../shared/partner/partner-theme-model';

/** Fila del listado — `GET /api/admin/partners` (US1, FR-001). Nunca incluye secretos (FR-016). */
export interface PartnerListItem {
  id: string;
  slug: string;
  displayName: string;
  status: PartnerStatus;
  credentialConfigured: boolean;
  currentVersion: number | null;
  updatedAt: string;
  updatedBy: string;
}

/** Partner + versiones — `GET /api/admin/partners/:id` (US3/US4). */
export interface PartnerDetail {
  id: string;
  slug: string;
  displayName: string;
  status: PartnerStatus;
  publishedTheme: PartnerTheme | null;
  draftTheme: PartnerTheme | null;
}

/** Alta — `POST /api/admin/partners` (US2, FR-004/005/006). */
export interface CreatePartnerRequest {
  slug: string;
  partnerKey: string;
  displayName: string;
}

export interface CreatePartnerResponse {
  partner: Partner;
  theme: PartnerTheme;
}

/** Guardar borrador — `PATCH /api/admin/partners/:id` (US3, FR-013). */
export interface SaveThemeVersionRequest {
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
}

/** Publicar — `POST /api/admin/partners/:id/publish` (US4, FR-014). */
export interface PublishRequest {
  themeId: string;
}

/** Subida de asset — `POST /api/admin/assets` (FR-009). El servidor deriva el key
 * estable `<partnerId>-<slot>.<ext>`, así re-subir un slot sobrescribe el archivo. */
export interface AssetUploadRequest {
  partnerId: string;
  slot: AssetSlotSlug;
  mimeType: string;
  base64: string;
}

/** Referencia pública al asset subido — SIN credenciales del bucket (SC-008). */
export interface StoredAssetRef {
  url: string;
  key: string;
}

/** Borrador en edición (Const. I → estado síncrono local, D5). No entra a TanStack Query hasta guardar. */
export interface ThemeDraft {
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
}

/** Advertencia de contraste AA — no invalida el form ni bloquea guardar/publicar (FR-008). */
export interface ContrastWarning {
  tokenKey: string;
  againstKey: string;
  ratio: number;
  minimum: number;
}

/** Filtro del buscador de partners (US1, D7) — aplicado en cliente sobre la lista cacheada. */
export interface PartnersListFilter {
  query: string;
  status?: PartnerStatus;
}
