import { randomUUID } from 'node:crypto';

export function createRequestId(): string {
  return randomUUID();
}

export interface RequestLogFields {
  readonly requestId: string;
  readonly partnerSlug?: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

/** Claves que jamás deben alcanzar un log, sin importar el llamador (FR-021). */
const FORBIDDEN_LOG_KEYS: ReadonlySet<string> = new Set(['apiKey', 'extra', 'baseUrl', 'body', 'payload']);

function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_LOG_KEYS.has(key)) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

/** Log de error correlacionado por `partnerSlug` + `requestId`, sin secretos (FR-021). */
export function logRequestError(fields: RequestLogFields): void {
  console.error(JSON.stringify(sanitizeFields(fields)));
}
