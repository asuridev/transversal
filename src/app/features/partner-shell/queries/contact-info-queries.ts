import { Injectable, inject } from '@angular/core';
import { queryOptions } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { ContactInfoApiService } from '../services/contact-info-api';
import type { ContactInfoRequest, ContactInfoResponse } from '../models/contact-info-model';

/**
 * Frontera de estado de servidor del KYC (Const. I → los componentes nunca
 * inyectan `ContactInfoApiService`). Es una **query** cacheada por documento: el
 * `QueryClient` (singleton de app) conserva la respuesta por
 * `slug + documentType + documentNumber`, de modo que volver atrás y reconsultar
 * el mismo documento es un cache hit (sin red). La consulta se dispara con el
 * click en "Consultar" vía el gate `enabled` (documento presente).
 *
 * Caché **solo en memoria** (nunca en disco: es PII). Se limpia en logout
 * (`partner-shell-layout`). El transporte sigue siendo POST (el `documentNumber`
 * viaja en el body, no en la URL) — el cacheo lo da el `queryKey`, no el método.
 */
@Injectable({ providedIn: 'root' })
export class ContactInfoQueries {
  private readonly api = inject(ContactInfoApiService);

  contactInfo(slug: string | null, req: ContactInfoRequest | null) {
    return queryOptions({
      queryKey: ['journey', 'contact-info', slug, req?.documentType, req?.documentNumber],
      queryFn: () => firstValueFrom(this.api.queryContactInfo(slug!, req!)),
      enabled: slug !== null && req !== null,
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  }
}
