import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
  AssetUploadRequest,
  CreatePartnerRequest,
  CreatePartnerResponse,
  PartnerDetail,
  PartnerListItem,
  PartnersListFilter,
  SaveThemeVersionRequest,
  StoredAssetRef,
} from '../models/partner-admin-model';
import type { PartnerTheme } from '../../../../shared/partner/partner-theme-model';

/**
 * Frontera HTTP del panel — envuelve `HttpClient`, mapea DTO↔modelo. Sin
 * lógica de negocio ni estado (ARCHITECTURE §3). Los componentes nunca la
 * inyectan directamente (Const. I) — solo `AdminQueries` vía `injectQuery`/
 * `injectMutation`.
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin`;

  listPartners(filter?: PartnersListFilter): Observable<PartnerListItem[]> {
    let params = new HttpParams();
    if (filter?.status) {
      params = params.set('status', filter.status);
    }
    return this.http.get<PartnerListItem[]>(`${this.baseUrl}/partners`, { params });
  }

  getPartner(id: string): Observable<PartnerDetail> {
    return this.http.get<PartnerDetail>(`${this.baseUrl}/partners/${id}`);
  }

  createPartner(req: CreatePartnerRequest): Observable<CreatePartnerResponse> {
    return this.http.post<CreatePartnerResponse>(`${this.baseUrl}/partners`, req);
  }

  saveThemeVersion(id: string, req: SaveThemeVersionRequest): Observable<PartnerTheme> {
    return this.http.patch<PartnerTheme>(`${this.baseUrl}/partners/${id}`, req);
  }

  publish(id: string, themeId: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.baseUrl}/partners/${id}/publish`, { themeId });
  }

  deactivate(id: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.baseUrl}/partners/${id}/deactivate`, {});
  }

  activate(id: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.baseUrl}/partners/${id}/activate`, {});
  }

  uploadAsset(req: AssetUploadRequest): Observable<StoredAssetRef> {
    return this.http.post<StoredAssetRef>(`${this.baseUrl}/assets`, req);
  }
}
