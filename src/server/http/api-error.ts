export type ApiErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'mashery_unavailable'
  | 'mashery_error'
  | 'internal';

/** Formato uniforme al que se traduce todo fallo de `/api/*` (data-model §3, FR-013). */
export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly requestId: string;
  readonly details?: Readonly<Record<string, string>>;
}

const HTTP_STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  mashery_unavailable: 502,
  mashery_error: 502,
  internal: 500,
};

export function httpStatusForCode(code: ApiErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

export function createApiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: Readonly<Record<string, string>>,
): ApiError {
  return details ? { code, message, requestId, details } : { code, message, requestId };
}

/** Fallos posibles al orquestar contra Mashery — entrada tipada de `normalizeMasheryError` (D7). */
export type MasheryFailure =
  | { readonly kind: 'no-credentials' }
  | { readonly kind: 'http-error'; readonly status: number }
  | { readonly kind: 'network-error'; readonly error: unknown };

/**
 * Única función que traduce un fallo de Mashery al `ApiError` uniforme (FR-013).
 * Ningún handler construye un `ApiError` con datos crudos de Mashery: ni el
 * `message`/`details` incluyen URL, `apiKey`, stack ni cuerpo crudo (SC-008).
 */
export function normalizeMasheryError(failure: MasheryFailure, requestId: string): ApiError {
  switch (failure.kind) {
    case 'no-credentials':
      return createApiError('mashery_unavailable', 'Integración no disponible para este partner', requestId);
    case 'http-error':
      return createApiError('mashery_error', 'El proveedor del journey respondió con un error', requestId);
    case 'network-error':
      return createApiError('mashery_unavailable', 'El proveedor del journey no respondió a tiempo', requestId);
  }
}
