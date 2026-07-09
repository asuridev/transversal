import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

interface SalesFlowState {
  correlationId: string | null;
}

const initialState: SalesFlowState = {
  correlationId: null,
};

/**
 * Estado (síncrono) del flujo de venta del asesor. Mantiene un `correlationId`
 * estable que identifica el flujo de punta a punta y acompaña el consumo de las
 * APIs externas del journey (estampado como `X-Correlation-Id` por
 * `correlation-interceptor.ts`).
 *
 * Ciclo de vida: `start()` lo acuña al entrar al shell del asesor (idempotente,
 * de modo que se mantiene estable entre los pasos del flujo); `end()` lo limpia
 * al cerrar sesión o al finalizar el flujo. Tras `end()`, el próximo `start()`
 * acuña un id nuevo.
 */
export const SalesFlowStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    /** Acuña un `correlationId` nuevo solo si aún no existe (idempotente). */
    start(): void {
      if (store.correlationId() !== null) {
        return;
      }
      patchState(store, { correlationId: crypto.randomUUID() });
    },
    /** Limpia el `correlationId` (logout o fin del flujo). */
    end(): void {
      patchState(store, { correlationId: null });
    },
  })),
);
