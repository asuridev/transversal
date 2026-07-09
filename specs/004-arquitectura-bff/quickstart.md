# Quickstart — Validación de la Arquitectura BFF

Guía **ejecutable** para validar que la frontera `/api/*` cumple sus garantías. No
duplica implementación: los detalles de forma están en `contracts/` y `data-model.md`.

## Prerrequisitos

- Node 22.20 (ya requerido por `002`/`003`).
- SQLite de partners disponible (`PARTNERS_DB_PATH`, adaptador de `002`).
- Variables de entorno de integración (adaptador V1 `EnvSecretResolver`): un
  Mashery compartido más una apiKey por partner de prueba, p. ej.:
  ```bash
  export MASHERY_BASEURL="http://localhost:9099/mashery"
  export PARTNER_BANCO_POPULAR_APIKEY="test-key-A"
  export PARTNER_OCCIDENTE_APIKEY="test-key-B"
  ```
- Un **Mashery mockeado** para el journey (servidor local que registre el `apiKey`/
  `baseUrl` recibidos) — para validar orquestación por partner (mismo Mashery, apiKey
  distinta por partner) sin Mashery real.

## Suite automatizada (fuente de verdad de CI)

`node:test`, ya cableado en `package.json` (`test:server` cubre `src/server/**`):

```bash
npm run test:server
```

Debe cubrir, como mínimo (SC-009):
- **Proyección pública** — `src/server/api/api-router.test.ts`: `GET /api/theme/:slug`
  responde `PublicTheme` sin secretos; `Cache-Control`/`ETag` presentes; `304` con
  `If-None-Match`.
- **Resolución de secretos (mockeada)** — `src/server/secrets/env-secret-resolver.test.ts`:
  resuelve por slug, cachea con TTL, `invalidate` fuerza relectura (rotación).
- **Orquestación por partner** — `src/server/journey/orchestrate-journey.test.ts`:
  la llamada saliente usa `baseUrl`+`apiKey` del partner correcto; dos partners no se
  mezclan; `resolve()===null` → `mashery_unavailable`.
- **Normalización de errores** — `src/server/http/api-error.test.ts`: distintos fallos
  de Mashery → `ApiError` uniforme sin detalles internos.
- **Resiliencia** — `orchestrate-journey.test.ts`: timeout acota; breaker abre tras N
  fallos.
- **Rate limit** — `src/server/security/rate-limit.test.ts`: ráfaga → `429`.
- **Allowlist TransferState** — `src/server/security/transfer-state-allowlist.test.ts`:
  solo `PublicTheme` pasa; otros campos se rechazan.
- **Admin protegido** — `api-router.test.ts`: `/api/admin/*` sin sesión → `401/403`;
  con sesión no expone secretos (solo `credentialConfigured`).

## Validación manual de la frontera (red real)

Con el server construido y corriendo (`npm run build && npm run serve:ssr`):

1. **Theme público cacheado (SC-004)**
   ```bash
   curl -i http://localhost:4000/api/theme/banco-popular
   ```
   Espera `200`, cuerpo `PublicTheme` **sin** `apiKey`/`baseUrl`/IDs, cabeceras
   `Cache-Control` + `ETag`. Repite con `-H "If-None-Match: <etag>"` → `304`.

2. **Slugs activos (FR-009)**
   ```bash
   curl -s http://localhost:4000/api/partners/active
   ```
   Espera `{ "slugs": [...] }` solo con activos.

3. **Journey por partner (SC-003)**: ejecuta una acción del journey y verifica en el
   **Mashery mockeado** que recibió el `apiKey` de **ese** partner contra el `baseUrl`
   compartido de Mashery:
   ```bash
   curl -i -X POST http://localhost:4000/api/journey/banco-popular/quote -d '{...}'
   ```
   El mock debe registrar `test-key-A`; la respuesta al cliente **no** contiene el
   `apiKey`.

4. **Rotación sin redeploy (SC-005)**: cambia `PARTNER_BANCO_POPULAR_APIKEY` en el
   gestor/env (mock), espera la ventana de refresco (TTL) y repite el paso 3 → el mock
   recibe el valor nuevo, **sin** reiniciar el server.

5. **Admin protegido (SC-006)**
   ```bash
   curl -i http://localhost:4000/api/admin/partners            # → 401/403
   curl -i -H "<sesión válida mock>" http://localhost:4000/api/admin/partners  # → 200, credentialConfigured
   ```

## Verificación de la regla dura (SC-001/002/007)

- **Bundle + network tab**: recorre un journey en el navegador con las devtools
  abiertas; verifica **cero** `apiKey`/endpoints de Mashery/IDs de integración en el
  código descargado y en las respuestas de red; el browser solo habla con `/api/*`.
- **TransferState**: inspecciona el estado transferido en el HTML SSR → contiene
  **únicamente** la proyección pública del theme (SC-007).
- Auditoría visual del journey con **Playwright CLI** (herramienta del agente, no CI)
  si se requiere validar el flujo completo de principio a fin.

## Criterios de salida (definición de "validado")

- [ ] `npm run test:server` verde, cubriendo proyección pública, secretos mockeados y
      normalización de errores (SC-009).
- [ ] `GET /api/theme/:slug` cacheado y sin secretos (SC-004).
- [ ] Journey golpea Mashery con las creds del partner correcto (SC-003).
- [ ] Rotación surte efecto sin redeploy (SC-005).
- [ ] Admin sin sesión → `401/403`; sin secretos en claro (SC-006).
- [ ] Bundle/red/`TransferState` sin secretos (SC-001/002/007).
- [ ] Errores de Mashery → formato uniforme sin fugas (SC-008).
</content>
