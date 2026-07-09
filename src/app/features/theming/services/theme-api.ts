import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { PublicTheme } from '../../../../shared/partner/public-theme-model';

/**
 * Firma final ya estable; el transporte HTTP real (`GET /api/theme/:slug`) llega
 * con el BFF (PRD 04). En esta feature, `initialData` desde `TransferState`
 * evita que este endpoint se invoque durante el primer paint y la navegación
 * entre pasos (contracts/theme-transfer.contract.md §4).
 */
@Injectable({ providedIn: 'root' })
export class ThemeApiService {
  private readonly http = inject(HttpClient);

  getTheme(slug: string): Observable<PublicTheme> {
    return this.http.get<PublicTheme>(`${environment.apiUrl}/theme/${slug}`);
  }
}
