import { Injectable, inject } from '@angular/core';
import { queryOptions } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PartnersApiService } from '../services/partners-api';

@Injectable({ providedIn: 'root' })
export class PartnersQueries {
  private readonly partnersApi = inject(PartnersApiService);

  activePartners() {
    return queryOptions({
      queryKey: ['partners', 'active'],
      queryFn: () => firstValueFrom(this.partnersApi.getActivePartners()),
      staleTime: environment.partnersStaleTime,
    });
  }
}
