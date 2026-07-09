import { normalizeMasheryError, type ApiError } from '../http/api-error.ts';
import type { SecretResolver } from '../secrets/secret-resolver.ts';
import type { MasheryClient } from './mashery-client.ts';

export interface JourneyRequest {
  readonly slug: string;
  readonly action: string;
  readonly payload: unknown;
}

export type JourneyResult = { readonly kind: 'ok'; readonly body: unknown } | { readonly kind: 'error'; readonly error: ApiError };

export interface OrchestrateJourneyDeps {
  readonly secretResolver: SecretResolver;
  readonly masheryClient: MasheryClient;
  readonly requestId?: string;
}

/**
 * Resuelve las creds del partner y orquesta la acción contra Mashery usando
 * el `apiKey` propio de ese partner contra el `baseUrl` único de Mashery
 * compartido (FR-011/012) — el aislamiento entre partners es por `apiKey`, no
 * por `baseUrl`. Todo fallo se traduce vía `normalizeMasheryError` — este es el
 * único punto que construye el `ApiError` de un fallo de Mashery (FR-013).
 */
export async function orchestrateJourney(
  request: JourneyRequest,
  deps: OrchestrateJourneyDeps,
): Promise<JourneyResult> {
  const requestId = deps.requestId ?? 'unknown';
  const creds = await deps.secretResolver.resolve(request.slug);

  if (!creds) {
    return { kind: 'error', error: normalizeMasheryError({ kind: 'no-credentials' }, requestId) };
  }

  try {
    const result = await deps.masheryClient.call({
      slug: request.slug,
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
      action: request.action,
      payload: request.payload,
    });

    if (!result.ok) {
      return { kind: 'error', error: normalizeMasheryError({ kind: 'http-error', status: result.status }, requestId) };
    }

    return { kind: 'ok', body: result.body };
  } catch (error) {
    return { kind: 'error', error: normalizeMasheryError({ kind: 'network-error', error }, requestId) };
  }
}
