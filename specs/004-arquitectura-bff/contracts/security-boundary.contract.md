# Contract — Security boundary (secretos, allowlist, rate limit)

Garantías **duras** de la frontera: ningún secreto cruza al cliente. Cubre FR-002,
FR-003, FR-004, FR-005, FR-006, FR-020, FR-021, FR-022 y SC-001/002/005/007.

---

## 1. Regla dura — cero secretos hacia el cliente (FR-002, SC-001/002)

- El browser se comunica **solo** con `/api/*` (mismo origen). Ninguna llamada del
  cliente va directa a servicios externos/Mashery.
- Ningún artefacto entregado (bundle, respuestas de red, `TransferState`) contiene
  `apiKey`, `baseUrl` de Mashery, endpoints internos ni IDs de integración.
- **Verificable**: inspección del bundle + network tab durante un journey → **cero**
  ocurrencias (SC-001/002).

## 2. Secretos server-side por request (FR-003/004/005/006)

- `SecretResolver.resolve(slug)` lee del gestor de secretos / env **por request**,
  del lado servidor; el valor **nunca** se serializa al cliente ni al `TransferState`.
- Secretos **no** hardcodeados ni versionados (FR-004): fuente = env/gestor inyectado
  en runtime.
- **Separación config/secreto (FR-005)**: theme en SQLite (`PartnerRepository`),
  creds en `SecretResolver`; nunca el mismo almacén ni respuesta.
- **Rotación sin redeploy (FR-006, D4)**: caché corta (TTL) + `invalidate`; tras la
  ventana, la siguiente resolución relee el valor nuevo.

**Acceptance**:
1. Cambiar la credencial de un partner (env/mock) → una acción del journey **tras la
   ventana de refresco** usa el valor nuevo, sin redeploy (SC-005).
2. El valor de `apiKey` no aparece en ninguna respuesta ni log (grep en test).

## 3. Allowlist de `TransferState` (FR-022, SC-007)

- Solo `PublicTheme` puede serializarse al cliente. `transfer-state-allowlist.ts`
  valida —server-side— que la clave/forma escrita en `TransferState` sea la del theme
  público; cualquier intento de serializar otro campo (p. ej. un secreto) se rechaza.
- Refuerza, del lado del BFF, la garantía que `003` ya asume al escribir
  `THEME_STATE_KEY`.

**Acceptance**:
1. El `TransferState` transferido contiene **únicamente** la proyección pública del
   theme; **cero** secretos/datos de integración (SC-007).
2. Un intento de escribir un campo fuera de la allowlist es rechazado en test.

## 4. Rate limiting (FR-020)

- Limiter in-memory por IP+ruta en endpoints públicos (`/api/theme`,
  `/api/partners/active`) para mitigar la enumeración de slugs (PRD 01 §10).
- Superar el umbral → `429 rate_limited`.

**Acceptance**: una ráfaga por encima del umbral sobre `/api/partners/active` →
`429`; el tráfico normal no se ve afectado.

## 5. Observabilidad sin secretos (FR-021)

- Cada request lleva un `requestId`; logs de error y trazas se correlacionan por
  `partnerSlug`.
- Los logs **nunca** incluyen `apiKey`, `extra`, ni payloads sensibles del journey.

**Acceptance**: un fallo del journey produce un log con `partnerSlug` + `requestId`
y **sin** el `apiKey` (verificado en test).

---

## Cobertura de tests exigida por la Constitución de seguridad (SC-009)

Los tests de la frontera cubren **como mínimo**:
- **Proyección pública** (`GET /api/theme/:slug` sin secretos) — §1, public-endpoints.
- **Resolución de secretos mockeada** (`SecretResolver`, rotación, no-serialización) — §2.
- **Normalización de errores** (`ApiError` uniforme, sin fugas) — error-normalization.
</content>
