import { Injectable, inject } from '@angular/core';
import { mutationOptions, queryOptions } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';

import { AuthApiService, type LogoutResponse } from '../services/auth-api';

@Injectable({ providedIn: 'root' })
export class AuthQueries {
  private readonly api = inject(AuthApiService);

  session() {
    return queryOptions({
      queryKey: ['auth', 'session'],
      queryFn: () => firstValueFrom(this.api.getSession()),
      retry: false,
    });
  }

  /** Mutación de cierre de sesión — la orquestación (limpiar store, redirigir) la hace el llamador. */
  logout() {
    return mutationOptions<LogoutResponse, Error, void>({
      mutationKey: ['auth', 'logout'],
      mutationFn: () => firstValueFrom(this.api.logout()),
    });
  }
}
