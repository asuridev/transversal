/**
 * Mecanismo reutilizable para obtener los `access_token` que las APIs externas
 * de Cardif exigen (pasos 2 y 3 de la cadena de autenticación de Mashery). Es
 * agnóstico del servicio final: `acquireApiTokens` devuelve el `paramj` (header
 * `__j`) y un buscador `tokenFor(name_api)` para que cada servicio (contact-info,
 * referenciales, ventas, …) tome el token que le corresponde.
 *
 * Paso 2 — `GET {authBaseUrl}/v1/params/__j` con `_p` + `correlation-id`
 *          ⇒ `bodyResponse.paramj`.
 * Paso 3 — `GET {authBaseUrl}/v2/tokenRequest/jwt?api=CU,REF,DS,SEC` con
 *          `__j=paramj` + `_p` + `correlation-id`
 *          ⇒ `bodyResponse[]` (cada item `{ name_api, access_token }`).
 */

const DEFAULT_TIMEOUT_MS = 5000;

/** APIs que se solicitan en el paso 3 (contact-info necesita `AuthorizationCustomer`, de `CU`). */
export const DEFAULT_TOKEN_APIS: readonly string[] = ['CU', 'REF', 'DS', 'SEC'];

export interface MasheryAuthConfig {
  /** Base del auth-service, p. ej. `https://webview-uat.cardif.com.co/mashery-auth-service`. */
  readonly authBaseUrl: string;
  readonly timeoutMs?: number;
}

export interface AcquireTokensInput {
  readonly partnerKey: string;
  readonly correlationId: string;
  /** APIs a solicitar; por defecto `DEFAULT_TOKEN_APIS`. */
  readonly apis?: readonly string[];
}

export interface AcquiredTokens {
  /** Valor de `paramj` (header `__j` de las llamadas posteriores). */
  readonly paramj: string;
  /** Access token por `name_api` (p. ej. `AuthorizationCustomer`), o `null` si no vino. */
  tokenFor(nameApi: string): string | null;
}

interface ParamsJResponse {
  readonly bodyResponse?: { readonly paramj?: string };
}

interface TokenItem {
  readonly name_api?: string;
  readonly access_token?: string;
}

interface TokenRequestResponse {
  readonly bodyResponse?: readonly TokenItem[];
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  console.log('[mashery-auth] → GET', url, { headers: redactHeaders(headers) });
  const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => undefined);
  console.log('[mashery-auth] ← GET', url, { status: response.status, body });
  if (!response.ok) {
    throw new Error(`mashery-auth GET ${url} respondió ${response.status}`);
  }
  return body;
}

/** No filtra el Bearer/tokens a los logs; deja visible solo lo no sensible. */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    clean[key] = key.toLowerCase() === 'authorization' || key === '__j' ? '«redacted»' : value;
  }
  return clean;
}

export async function acquireApiTokens(
  config: MasheryAuthConfig,
  input: AcquireTokensInput,
): Promise<AcquiredTokens> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const commonHeaders = { _p: input.partnerKey, 'correlation-id': input.correlationId };

  // Paso 2 — obtener paramj.
  const paramsBody = (await getJson(
    `${config.authBaseUrl}/v1/params/__j`,
    commonHeaders,
    timeoutMs,
  )) as ParamsJResponse;
  const paramj = paramsBody?.bodyResponse?.paramj;
  if (typeof paramj !== 'string' || paramj.length === 0) {
    throw new Error('mashery-auth: respuesta de /v1/params/__j sin paramj');
  }

  // Paso 3 — obtener los access_token para las APIs solicitadas.
  const apis = input.apis ?? DEFAULT_TOKEN_APIS;
  const tokenBody = (await getJson(
    `${config.authBaseUrl}/v2/tokenRequest/jwt?api=${apis.join(',')}`,
    { __j: paramj, ...commonHeaders },
    timeoutMs,
  )) as TokenRequestResponse;

  const tokensByName = new Map<string, string>();
  for (const item of tokenBody?.bodyResponse ?? []) {
    if (item?.name_api && item?.access_token) {
      tokensByName.set(item.name_api, item.access_token);
    }
  }

  return {
    paramj,
    tokenFor: (nameApi: string) => tokensByName.get(nameApi) ?? null,
  };
}
