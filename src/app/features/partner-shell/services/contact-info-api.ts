import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { ContactInfoRequest, ContactInfoResponse } from '../models/contact-info-model';

/**
 * Frontera HTTP de la consulta de contacto del KYC — envuelve `HttpClient`. Sin
 * lógica de negocio ni estado (ARCHITECTURE §3). Los componentes nunca la
 * inyectan directamente (Const. I) — solo `ContactInfoQueries` vía `injectMutation`.
 *
 * La URL bajo `/journey/` hace que la petición herede el `correlation-interceptor`
 * (estampa `X-Correlation-Id` del flujo de venta) y la frontera partner-scoped
 * del BFF (`requirePartnerScope`).
 */
@Injectable({ providedIn: 'root' })
export class ContactInfoApiService {
  private readonly http = inject(HttpClient);

  queryContactInfo(slug: string, req: ContactInfoRequest): Observable<ContactInfoResponse> {
    return this.http.post<ContactInfoResponse>(`${environment.apiUrl}/journey/${slug}/contact-info`, req);
  }
}
