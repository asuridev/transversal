import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { AuthUser } from '../../../core/auth/auth-model';

export type SessionDto = AuthUser;

/** Respuesta de `POST /api/auth/logout` (RP-initiated logout OIDC, feature 008). */
export interface LogoutResponse {
  readonly ok: boolean;
  /** URL de fin de sesión del reino (RP-initiated logout) si el IdP la soporta. */
  readonly endSessionUrl?: string;
}

/**
 * Frontera HTTP de la sesión — envuelve `HttpClient`, sin lógica de negocio
 * (ARCHITECTURE §3). Los componentes/guards nunca la inyectan directamente
 * (Const. I) — solo `AuthQueries` vía `injectQuery`.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  getSession(): Observable<SessionDto> {
    return this.http.get<SessionDto>(`${environment.apiUrl}/admin/session`);
  }

  /** Cierra la sesión del BFF (expira `bo_session`/`csrf`) y devuelve, si aplica, la URL de fin de sesión del reino. */
  logout(): Observable<LogoutResponse> {
    return this.http.post<LogoutResponse>(`${environment.apiUrl}/auth/logout`, {});
  }
}
