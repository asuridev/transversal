# Contract — Journey proxy (`POST /api/journey/:slug/*`)

Orquesta las acciones del journey de venta contra **Mashery**
(endpoint único, compartido por todos los partners) **inyectando la apiKey del
partner activo**, resuelta del lado servidor. Cubre FR-011, FR-012, FR-013, FR-014.

---

## `POST /api/journey/:slug/*`

- **Entrada**: `:slug` (validado, FR-019) + subpath `*` (acción del journey) + body
  del journey (validado). Sesión de journey según el modelo del producto.
- **Resolución de integración (FR-011/012, server-side)**:
  1. `SecretResolver.resolve(slug)` → `IntegrationCreds { baseUrl, apiKey, … }`.
     Si `null` (partner sin integración configurada) → `502 mashery_unavailable`
     (falla controlada, **sin** usar credenciales de otro partner — edge case).
  2. La llamada saliente usa el `baseUrl` compartido de Mashery y
     **exclusivamente** el `apiKey` de **ese** partner; nunca se mezclan apiKeys
     entre partners (FR-012).
- **Cliente HTTP (D2)**: `fetch` nativo de Node (sin axios). El `apiKey` viaja solo
  en la llamada server→Mashery; **jamás** al cliente ni al `TransferState` (FR-003).
- **Resiliencia (FR-014, D5)**:
  - **Timeout** por intento vía `AbortSignal.timeout(<ms>)`.
  - **Reintentos acotados** (n fijo, solo transitorios/idempotentes, backoff simple).
  - **Circuit breaker** por partner: al superar el umbral de fallos abre el circuito
    → `502 mashery_unavailable` inmediato hasta el cooldown (semiabre y reprueba).
- **Normalización (FR-013)**: cualquier error de Mashery pasa por
  `normalizeMasheryError()` → `ApiError` uniforme. **Nunca** se filtran trazas,
  endpoints, ni mensajes crudos de Mashery.
- **Salida `200`**: `JourneyResponse` — resultado de Mashery normalizado, sin
  endpoints/IDs internos.
- **Observabilidad (FR-021)**: log correlacionado por `partnerSlug` + `requestId`,
  **sin** el `apiKey` ni el payload sensible.

**Acceptance**:
1. Acción del journey para el partner A → la llamada saliente golpea el `baseUrl`
   de Mashery con el `apiKey` de A (ambos mockeados en test), resueltos
   server-side (SC-003).
2. Dos partners A y B ejecutan la misma acción contra el mismo Mashery → cada
   llamada usa **solo** el `apiKey` de su partner; sin mezcla (FR-012).
3. `SecretResolver.resolve` devuelve `null` → `502 mashery_unavailable`, sin usar
   creds de otro partner.
4. Mashery responde error → el front recibe `ApiError` uniforme, **sin** detalle
   interno de Mashery (SC-008).
5. Mashery no responde dentro del timeout → la request termina acotada
   (`502/504`), no cuelga indefinidamente (FR-014).
6. Tras N fallos consecutivos, el breaker abre → respuestas inmediatas
   `mashery_unavailable` hasta el cooldown.
7. La respuesta y los logs **no** contienen `apiKey` ni `baseUrl` (FR-003/021).
