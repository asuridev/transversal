import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PartnerSlug } from '../models/partner-model';

interface ActivePartnersDtoA {
  readonly slugs: readonly string[];
}

interface ActivePartnersDtoB {
  readonly partners: ReadonlyArray<{ readonly slug: string; readonly status: string }>;
}

type ActivePartnersDto = ActivePartnersDtoA | ActivePartnersDtoB;

function isDtoA(dto: ActivePartnersDto): dto is ActivePartnersDtoA {
  return Array.isArray((dto as ActivePartnersDtoA).slugs);
}

@Injectable({ providedIn: 'root' })
export class PartnersApiService {
  private readonly http = inject(HttpClient);

  getActivePartners(): Observable<ReadonlySet<PartnerSlug>> {
    return this.http.get<ActivePartnersDto>(`${environment.apiUrl}/partners/active`).pipe(
      map((dto) =>
        isDtoA(dto)
          ? new Set(dto.slugs)
          : new Set(dto.partners.filter((p) => p.status === 'active').map((p) => p.slug)),
      ),
    );
  }
}
