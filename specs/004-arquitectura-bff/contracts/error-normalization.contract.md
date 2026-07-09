# Contract — Error normalization (`ApiError`)

Todo fallo servido por `/api/*` se traduce al **formato de error uniforme** del
front, alineado con el `error-interceptor` (ARCHITECTURE §3). **Nunca** filtra
trazas, endpoints ni mensajes crudos de Mashery. Cubre FR-013, SC-008.

---

## Forma

```typescript
interface ApiError {
  code: string;       // estable, mapeable en el front
  message: string;    // seguro para mostrar; NUNCA mensaje crudo de Mashery
  requestId: string;  // correlación (FR-021)
  details?: Record<string, string>; // opcional, sin datos sensibles
}
```

## Mapa de códigos

| `code` | HTTP | Cuándo |
|--------|------|--------|
| `invalid_input` | 400 | validación de entrada (slug/body/upload) — FR-019 |
| `unauthorized` | 401/403 | `adminAuthGuard` deniega — FR-015 |
| `not_found` | 404 | recurso inexistente (sin filtrar existencia de otros) |
| `rate_limited` | 429 | limiter público — FR-020 |
| `mashery_unavailable` | 502/504 | timeout, breaker abierto, o creds no configuradas — FR-014 |
| `mashery_error` | 502 | error de Mashery normalizado — FR-013 |
| `internal` | 500 | error inesperado (mensaje genérico) |

## Reglas

- `normalizeMasheryError(raw): ApiError` es la **única** función que traduce errores
  de Mashery; ningún handler construye errores con datos de Mashery directamente.
- `message` y `details` **jamás** incluyen: URL/endpoint de Mashery, `apiKey`,
  stack traces, ni el cuerpo crudo de la respuesta de Mashery (SC-008).
- Todo `ApiError` lleva `requestId` para correlación con los logs (FR-021).
- El shape es el que el `error-interceptor` del front ya espera (`normalizeApiError`,
  ARCHITECTURE §3) — no se introduce un formato divergente.

## Acceptance

1. Forzando distintos fallos de Mashery (mockeados: 500, timeout, cuerpo con
   endpoint interno) → el front recibe **siempre** `ApiError` con `code`/`message`/
   `requestId`, **sin** ninguno de los detalles internos (SC-008).
2. Un `invalid_input` detalla el campo en `details` pero **no** el valor sensible.
3. Todo `ApiError` emitido tiene un `requestId` no vacío y correlacionable con el log
   de esa request.
</content>
