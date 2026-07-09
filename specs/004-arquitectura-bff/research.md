# Phase 0 — Research: Arquitectura BFF

Decisiones que resuelven los puntos abiertos del *Technical Context*. Ninguna
introduce dependencias npm nuevas ni contradice la Constitución (I–IV). Formato por
decisión: **Decision / Rationale / Alternatives considered**.

---

## D1 — Frontera `/api/*` como router Express montado en el proceso SSR

**Decision**: Añadir un **router Express** (`src/server/api/api-router.ts`) montado
en `src/server.ts` bajo el prefijo `/api`, **antes** del `app.use` catch-all que
delega en `AngularNodeAppEngine` (SSR de `003`). El servidor SSR **es** el BFF: un
proceso, un deploy (PRD 04 §2).

**Rationale**: El host Express ya existe (introducido por `003`); montar el router
antes del catch-all garantiza que `/api/*` nunca caiga al render Angular. Cohesión
y anti-FOUC: el mismo proceso resuelve theme SSR y sirve `/api/theme/:slug`, sin
salto de red. Los `static` de `/browser` ya van antes; el orden final es
`static → /api router → SSR catch-all`.

**Alternatives considered**:
- *Microservicio BFF aparte*: rechazado por PRD 00/04 (más superficie operativa,
  pierde `TransferState` nativo y cohesión SSR).
- *Route handlers de Angular (`@angular/ssr` server routes)*: sirven para render,
  no para una API REST con verbos/errores/rate-limit; Express es el host idiomático
  para `/api/*` y ya está presente.

---

## D2 — Cliente HTTP de Mashery: `fetch`/`undici` nativo de Node 22

**Decision**: Orquestar las llamadas a Mashery con el **`fetch` global nativo** de
Node 22 (undici), con `AbortSignal.timeout(ms)` para el timeout. **Sin `axios`** ni
otro cliente HTTP.

**Rationale**: La Constitución I prohíbe `axios` para proteger el **bundle del
cliente**; el runtime servidor puede usar el cliente nativo (PRD 04 §6). `fetch`
nativo evita dependencias, soporta `AbortSignal.timeout` y streaming, y es estable
en Node 22.20. Un cliente nativo mantiene la superficie mínima (single-node V1).

**Alternatives considered**:
- *`axios`*: prohibido por Constitución (aun en server, mejor no introducirlo para
  no arriesgar fugas al bundle ni contradecir la regla).
- *`HttpClient` de Angular en contexto server*: posible pero acopla la orquestación
  de Mashery al framework de UI; `fetch` nativo es más simple y desacoplado.
- *`got`/`ky`*: dependencia extra sin beneficio sobre `fetch` nativo aquí.

---

## D3 — Puerto `SecretResolver` con adaptador V1 por variables de entorno

**Decision**: Definir un puerto `SecretResolver` que resuelve
`partnerSlug → IntegrationCreds { baseUrl, apiKey, … }`. Adaptador V1
(`EnvSecretResolver`) lee `baseUrl` de una **única variable de entorno global**
(`MASHERY_BASEURL`, no por partner) y `apiKey` por partner con convención de
nombre (`PARTNER_<SLUG>_APIKEY`), obtenido vía factory plana
(`createSecretResolver()`), patrón idéntico a `createPartnerRepository` (`002`).
La resolución ocurre **por request**, del lado servidor, y **nunca** se serializa al
cliente ni al `TransferState`.

**Rationale**: Desacopla los handlers del gestor de secretos concreto (Vault / AWS /
GCP / Azure): migrar = cambiar el adaptador, sin tocar la orquestación (FR-003/005).
Env vars son la fuente V1 aceptada por PRD 04 §5 y la Constitución de seguridad
(nunca hardcodeadas ni versionadas). Separa **config visual** (theme en SQLite) de
**secreto de integración** (gestor de secretos) — nunca el mismo almacén (FR-005).
Mashery es un **único core multi-tenant por credencial** (no un servidor
por partner): por eso `baseUrl` dejó de ser por-slug y pasó a ser una única
variable de entorno global, mientras `apiKey` se mantiene por partner.

**Alternatives considered**:
- *Guardar creds en SQLite junto al theme*: rechazado por FR-005 (mezcla config y
  secreto; el theme se sirve público y cacheado — riesgo de fuga).
- *Leer `process.env` directo en cada handler*: rechazado; sin puerto no hay swap a
  Vault sin reescribir handlers, ni punto único para caché/invalidación.

---

## D4 — Rotación sin redeploy: caché corta con TTL + invalidación

**Decision**: `SecretResolver` cachea `IntegrationCreds` por slug en memoria con
**TTL corto** (parámetro de config, p. ej. 30–60 s) e **invalidación explícita**.
Tras la ventana de refresco, la siguiente resolución relee del gestor de secretos.

**Rationale**: Una credencial rotada surte efecto **sin redeploy** dentro de la
ventana (FR-006, SC-005), evitando a la vez golpear el gestor de secretos en cada
request. El valor de TTL es config (industria estándar salvo indicación — *Assumptions*
del spec). Single-node V1: la caché in-memory basta; el escalado la moverá a un store
compartido cambiando el adaptador.

**Alternatives considered**:
- *Sin caché (leer siempre)*: correcto pero costoso y sensible a latencia del gestor.
- *Caché sin TTL (solo invalidación por evento)*: frágil si el evento de rotación no
  llega; el TTL corto da una garantía de convergencia acotada.

---

## D5 — Resiliencia del journey: timeout + reintentos acotados + circuit breaker in-house

**Decision**: `mashery-client.ts` implementa, en-house: (a) **timeout** por intento
vía `AbortSignal.timeout`; (b) **reintentos acotados** (n fijo, solo en errores
idempotentes/transitorios, con backoff simple); (c) **circuit breaker** in-memory por
partner (umbral de fallos → abre → semiabre tras cooldown). Todos parametrizados por
config; single-node V1.

**Rationale**: Acota el impacto de un Mashery lento o caído (FR-014, edge case),
degradando de forma controlada sin colgar la experiencia. In-house evita dependencia
externa (opossum, cockatiel) para una lógica pequeña y single-node; el estado del
breaker es in-memory (aceptable con una instancia). Alineado con "superficie mínima".

**Alternatives considered**:
- *Librería de circuit breaker (opossum)*: dependencia extra; el breaker single-node
  es trivial en-house y evita acoplar el runtime a un paquete.
- *Sin breaker (solo timeout+retry)*: no protege contra un Mashery caído sostenido
  (los reintentos amplifican la carga); el breaker corta pronto.

---

## D6 — Autorización admin: seam que exige protección, mecanismo en PRD 06

**Decision**: Un `adminAuthGuard` (middleware Express) protege todo `/api/admin/*`:
**rechaza (401/403)** cualquier petición sin sesión válida de administrador. El
**mecanismo de verificación** (SSO/token, roles, auditoría) es de **PRD 06**; esta
feature define el **seam** (puerto `AdminAuthGuard`) y el comportamiento por defecto:
denegar. Ninguna respuesta admin devuelve secretos en claro (solo metadatos
"credencial configurada sí/no").

**Rationale**: Cumple FR-015/016 sin adelantar la identidad (fuera de alcance). El
seam permite que PRD 06 conecte el verificador real sin tocar los handlers admin. El
default-deny evita exponer endpoints admin por omisión.

**Alternatives considered**:
- *Implementar SSO aquí*: fuera de alcance (PRD 06 lo posee); acoplaría dos features.
- *Dejar admin sin protección "por ahora"*: viola FR-015 y la regla de frontera
  protegida; el default-deny es la postura segura.

---

## D7 — Normalización de errores: formato uniforme alineado con `error-interceptor`

**Decision**: Un tipo `ApiError` uniforme (`{ code, message, requestId, details? }`,
sin trazas ni datos internos) al que `normalizeMasheryError()` traduce **todo** fallo
de Mashery y de validación. El `error-interceptor` del front (ARCHITECTURE §3)
consume ese formato. Los `details` nunca incluyen mensajes crudos/endpoints de
Mashery.

**Rationale**: El front recibe siempre el mismo shape (FR-013, SC-008), sin filtrar
detalles internos (US6). Coherente con `normalizeApiError` referenciado en
ARCHITECTURE §3. Un mapeo central evita que cada handler invente su propio error.

**Alternatives considered**:
- *Reenviar el error de Mashery tal cual*: fuga de detalles internos (viola FR-013).
- *Códigos HTTP sin cuerpo uniforme*: el front necesita un `code`/`message`
  estables; solo el status no basta para el `error-interceptor`.

---

## D8 — Caché del theme público: `Cache-Control` para server/CDN

**Decision**: `GET /api/theme/:slug` responde con **`Cache-Control`** (p. ej.
`public, max-age=<corto>, stale-while-revalidate`) y un validador (`ETag` derivado de
`version`) para reutilización en capas intermedias (servidor/CDN) sin reconsultar el
origen en cada visita. Los valores son config.

**Rationale**: Habilita el anti-FOUC de `003` sin recomputar el theme por visita
(FR-008, SC-004). `version` del `PublicTheme` es un validador natural (cambia al
publicar). El shape servido es exactamente `PublicTheme` de `002` (sin secretos).

**Alternatives considered**:
- *Sin caché*: recomputa por request; contradice PRD 03 §6 y SC-004.
- *Caché sin validador*: no permite revalidación barata al publicar una versión
  nueva; el `ETag`/`version` da invalidación precisa.

---

## D9 — Rate limiting in-memory por IP+ruta (single-node)

**Decision**: Middleware `rate-limit.ts` in-house, ventana fija o token-bucket
in-memory, keyeado por IP + ruta, aplicado a endpoints **públicos** (`/api/theme`,
`/api/partners/active`) para mitigar la **enumeración de slugs** (FR-020, PRD 01 §10).
Límites por config; single-node V1.

**Rationale**: Single-node hace trivial el limiter in-memory; evita `express-rate-limit`
y un store (Redis) que el escalado sí requerirá — entonces se cambia el adaptador del
store, no el handler. Mitiga el sondeo de slugs sin dependencia nueva.

**Alternatives considered**:
- *`express-rate-limit` + Redis*: sobredimensionado para V1 single-node; se adopta al
  escalar (junto con Postgres, PRD 02 §5).
- *Sin rate limit*: deja la enumeración de slugs abierta (viola FR-020).

---

## D10 — Intermediación de uploads: puerto `AssetStorage` (URL firmada o proxy)

**Decision**: Puerto `AssetStorage` para `POST /api/admin/assets`: el BFF valida el
binario (reusa `validateBrandAsset` de `002` + `svg-sanitize`) y luego **intermedia**
la subida al object storage vía **URL firmada** (preferido) o **proxy**, sin exponer
credenciales del almacenamiento al cliente (FR-017). Adaptador real fuera de V1; seam
definido con factory.

**Rationale**: El cliente nunca recibe credenciales del storage; la validación ocurre
server-side antes de subir. Puerto = swap del backend de storage sin tocar el handler.
Reutiliza la validación de assets ya entregada por `002`.

**Alternatives considered**:
- *Subida directa del cliente al bucket con credenciales*: expone credenciales del
  storage (viola FR-017); rechazado.
- *Guardar binarios en SQLite*: mezcla assets pesados con la config; el object storage
  + CDN es el destino correcto (PRD 02).

---

## Resumen de decisiones

| # | Tema | Decisión | Dependencia nueva |
|---|------|----------|-------------------|
| D1 | Frontera | Router Express `/api/*` en el proceso SSR | no |
| D2 | Cliente Mashery | `fetch`/`undici` nativo (sin axios) | no |
| D3 | Secretos | Puerto `SecretResolver` + adaptador env V1 | no |
| D4 | Rotación | Caché corta (TTL) + invalidación | no |
| D5 | Resiliencia | timeout + retry acotado + breaker in-house | no |
| D6 | Admin | Seam `AdminAuthGuard` (default-deny; identidad → PRD 06) | no |
| D7 | Errores | `ApiError` uniforme + `normalizeMasheryError` | no |
| D8 | Caché theme | `Cache-Control` + `ETag`(version) | no |
| D9 | Rate limit | Limiter in-memory por IP+ruta (single-node) | no |
| D10 | Uploads | Puerto `AssetStorage` (URL firmada/proxy) | no |

Todas las decisiones respetan la Constitución (anti-axios protegido, sin librerías de
estado/estilo del front nuevas) y el modelo single-node V1 con swap de adaptador para
el escalado.
</content>
