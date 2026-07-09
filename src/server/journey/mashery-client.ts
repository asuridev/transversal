export interface MasheryCallInput {
  readonly slug: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly action: string;
  readonly payload: unknown;
}

export interface MasheryCallResult {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

export interface MasheryClient {
  call(input: MasheryCallInput): Promise<MasheryCallResult>;
}

export interface MasheryClientOptions {
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly breakerThreshold?: number;
  readonly breakerCooldownMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BREAKER_THRESHOLD = 5;
const DEFAULT_BREAKER_COOLDOWN_MS = 30_000;

interface BreakerState {
  failures: number;
  openUntil: number | null;
}

async function performCall(input: MasheryCallInput, timeoutMs: number): Promise<MasheryCallResult> {
  const response = await fetch(`${input.baseUrl}/${input.action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify(input.payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => undefined);
  return { ok: response.ok, status: response.status, body };
}

/**
 * Cliente HTTP de Mashery con `fetch` nativo de Node (sin axios, D2): timeout
 * por intento, reintentos acotados solo ante fallos de red/timeout, y circuit
 * breaker in-memory por partner (D5, FR-014). Un error HTTP de Mashery (4xx/5xx)
 * se devuelve como resultado (no se reintenta ni abre el breaker); solo las
 * excepciones de red/timeout cuentan como fallo del breaker.
 */
export function createMasheryClient(options: MasheryClientOptions = {}): MasheryClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const breakerThreshold = options.breakerThreshold ?? DEFAULT_BREAKER_THRESHOLD;
  const breakerCooldownMs = options.breakerCooldownMs ?? DEFAULT_BREAKER_COOLDOWN_MS;
  const breakers = new Map<string, BreakerState>();

  function getBreaker(slug: string): BreakerState {
    let state = breakers.get(slug);
    if (!state) {
      state = { failures: 0, openUntil: null };
      breakers.set(slug, state);
    }
    return state;
  }

  return {
    async call(input: MasheryCallInput): Promise<MasheryCallResult> {
      const breaker = getBreaker(input.slug);
      const now = Date.now();

      if (breaker.openUntil !== null) {
        if (now < breaker.openUntil) {
          throw new Error('circuit_open');
        }
        breaker.openUntil = null;
      }

      let lastError: unknown;
      for (let attemptNumber = 0; attemptNumber <= maxRetries; attemptNumber++) {
        try {
          const result = await performCall(input, timeoutMs);
          breaker.failures = 0;
          return result;
        } catch (err) {
          lastError = err;
        }
      }

      breaker.failures += 1;
      if (breaker.failures >= breakerThreshold) {
        breaker.openUntil = Date.now() + breakerCooldownMs;
      }
      throw lastError;
    },
  };
}
