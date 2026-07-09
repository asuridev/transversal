import { Injectable, inject } from '@angular/core';
import { mutationOptions, queryOptions, QueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { AdminApiService } from '../services/admin-api';
import type {
  AssetUploadRequest,
  CreatePartnerRequest,
  CreatePartnerResponse,
  PartnersListFilter,
  SaveThemeVersionRequest,
  StoredAssetRef,
} from '../models/partner-admin-model';
import type { PartnerTheme } from '../../../../shared/partner/partner-theme-model';

/**
 * Frontera de estado de servidor del panel admin: queries y mutaciones
 * (Const. I → los componentes nunca inyectan `AdminApiService`). Cada mutación
 * devuelve `mutationOptions` con su `mutationFn` **y la invalidación por
 * `queryKey`**, junto a las `queryKey` que ya viven aquí — espejo de
 * `AuthQueries.logout()`. Los efectos de UI (toasts, navegación, errores de
 * formulario) los compone el llamador vía los callbacks de `.mutate()`.
 */
@Injectable({ providedIn: 'root' })
export class AdminQueries {
  private readonly api = inject(AdminApiService);
  private readonly queryClient = inject(QueryClient);

  partners(filter?: PartnersListFilter) {
    return queryOptions({
      queryKey: ['admin', 'partners', filter?.status ?? 'all'],
      queryFn: () => firstValueFrom(this.api.listPartners(filter)),
      staleTime: 30_000,
    });
  }

  partner(id: string) {
    return queryOptions({
      queryKey: ['admin', 'partners', id],
      queryFn: () => firstValueFrom(this.api.getPartner(id)),
      staleTime: 30_000,
    });
  }

  /** Guardar borrador de tema (US3, FR-013) — invalida el detalle del partner. */
  saveTheme(id: string) {
    return mutationOptions<PartnerTheme, Error, SaveThemeVersionRequest>({
      mutationKey: ['admin', 'partners', id, 'save'],
      mutationFn: (draft) => firstValueFrom(this.api.saveThemeVersion(id, draft)),
      onSuccess: () => {
        this.queryClient.invalidateQueries({ queryKey: ['admin', 'partners', id] });
      },
    });
  }

  /** Publicar la versión borrador (US4, FR-014) — invalida detalle y listado. */
  publish(id: string) {
    return mutationOptions<{ ok: true }, Error, string>({
      mutationKey: ['admin', 'partners', id, 'publish'],
      mutationFn: (themeId) => firstValueFrom(this.api.publish(id, themeId)),
      onSuccess: () => {
        this.queryClient.invalidateQueries({ queryKey: ['admin', 'partners', id] });
        this.queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      },
    });
  }

  /** Alta de partner (US2, FR-004) — invalida el listado. */
  createPartner() {
    return mutationOptions<CreatePartnerResponse, Error, CreatePartnerRequest>({
      mutationKey: ['admin', 'partners', 'create'],
      mutationFn: (req) => firstValueFrom(this.api.createPartner(req)),
      onSuccess: () => {
        this.queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      },
    });
  }

  /** Desactivar partner (US1) — invalida detalle y listado. */
  deactivate() {
    return mutationOptions<{ ok: true }, Error, string>({
      mutationKey: ['admin', 'partners', 'deactivate'],
      mutationFn: (id) => firstValueFrom(this.api.deactivate(id)),
      onSuccess: (_result, id) => this.invalidatePartner(id),
    });
  }

  /** Reactivar partner (US1) — invalida detalle y listado. */
  activate() {
    return mutationOptions<{ ok: true }, Error, string>({
      mutationKey: ['admin', 'partners', 'activate'],
      mutationFn: (id) => firstValueFrom(this.api.activate(id)),
      onSuccess: (_result, id) => this.invalidatePartner(id),
    });
  }

  /** Subir asset (FR-009) — la URL devuelta la propaga el llamador al `FormControl`. */
  uploadAsset() {
    return mutationOptions<StoredAssetRef, Error, AssetUploadRequest>({
      mutationKey: ['admin', 'assets', 'upload'],
      mutationFn: (req) => firstValueFrom(this.api.uploadAsset(req)),
    });
  }

  private invalidatePartner(id: string): void {
    this.queryClient.invalidateQueries({ queryKey: ['admin', 'partners', id] });
    this.queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
  }
}
