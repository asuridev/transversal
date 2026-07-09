/**
 * Paso 1 (principal) de la consulta de información de contacto por documento:
 * `GET {customerBaseUrl}/customer/v1/external/contact_info` con los headers de
 * autenticación ya resueltos por `mashery-auth.ts` (`__j` = paramj,
 * `Authorization: Bearer` = access_token de `AuthorizationCustomer`) más el
 * `_p` (partnerKey) y `correlation-id` propios del flujo.
 *
 * Devuelve el body JSON de Cardif tal cual — se asume el mismo envelope
 * (`responseHeader` + `bodyResponse.personalInformation`) que el front ya espera.
 */

const DEFAULT_TIMEOUT_MS = 5000;

export interface ContactInfoConfig {
  /** Base del customer-service, p. ej. `https://api-services-uat.cardifnet.com/CO/UAT`. */
  readonly customerBaseUrl: string;
  readonly timeoutMs?: number;
}

export interface FetchContactInfoInput {
  readonly partnerKey: string;
  readonly correlationId: string;
  /** `paramj` devuelto por `acquireApiTokens` → header `__j`. */
  readonly paramj: string;
  /** access_token de `AuthorizationCustomer` → `Authorization: Bearer`. */
  readonly accessToken: string;
  readonly documentType: string;
  readonly documentNumber: string;
}

export async function fetchContactInfo(config: ContactInfoConfig, input: FetchContactInfoInput): Promise<unknown> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const query = new URLSearchParams({
    customerDocumentType: input.documentType,
    customerDocumentNumber: input.documentNumber,
  });
  const url = `${config.customerBaseUrl}/customer/v1/external/contact_info?${query.toString()}`;
  const headers = {
    __j: input.paramj,
    _p: input.partnerKey,
    'correlation-id': input.correlationId,
    authorization: `Bearer ${input.accessToken}`,
  };

  console.log('[contact-info] → GET', url, { headers: headers });
  const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => undefined);
  console.log('[contact-info] ← GET', url, { status: response.status, body });
  if (!response.ok) {
    throw new Error(`contact-info GET respondió ${response.status}`);
  }
  return body;
}
