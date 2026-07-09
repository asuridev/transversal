# Phase 1 — Data Model: Arquitectura BFF

Esta feature **no** crea tablas ni migra datos: la persistencia de partners vive tras
`PartnerRepository` (`002`) y se consume in-process. El "modelo" aquí son los
**puertos de frontera**, las **entidades de request/response** de `/api/*` y el
**error uniforme**. Los tipos de dominio (`Partner`, `PartnerTheme`, `PublicTheme`)
se reutilizan de `002` sin redefinir.

---

## 1. Puertos (interfaces server-side)

### 1.1 `PartnerRepository` (reutilizado de `002`, **no** se redefine)

Única vía de persistencia de los handlers público/admin (FR-018). Ver
`src/server/persistence/partner-repository.ts`. Métodos consumidos por esta feature:
`findActiveSlugs()`, `findBySlug()`, `getPublishedTheme()`, `listPartners()`,
`createPartner()`, `saveThemeVersion()`, `publishThemeVersion()`,
`deactivatePartner()`. Obtenido con `createPartnerRepository()`.

### 1.2 `SecretResolver` (nuevo)

Resuelve las credenciales de integración de un partner, del lado servidor, por
request. **Nunca** cruza al cliente (FR-003/005/006).

```typescript
// src/server/secrets/secret-resolver.ts
export interface IntegrationCreds {
  readonly baseUrl: string;      // endpoint fijo de Mashery, compartido por TODOS los partners
  readonly apiKey: string;       // secreto propio de ESTE partner — jamás serializado al cliente
  readonly extra?: Readonly<Record<string, string>>;
}

export interface SecretResolver {
  /** Resuelve creds del partner por slug, o null si no está configurado. Con caché corta + invalidación. */
  resolve(slug: string): Promise<IntegrationCreds | null>;
  /** Fuerza relectura del gestor de secretos en la próxima resolución (rotación). */
  invalidate(slug: string): void;
  /** Solo metadatos para admin: ¿hay credencial configurada? (nunca el valor) — FR-016. */
  isConfigured(slug: string): Promise<boolean>;
}
```

`baseUrl` es idéntico para todos los slugs (un único Mashery V1); solo
`apiKey` varía por partner.

**Reglas**: `resolve` cachea con **TTL corto** (D4) e `invalidate` limpia la entrada;
`apiKey`/`extra` **nunca** aparecen en respuestas ni logs. Adaptador V1
`EnvSecretResolver` (env vars). Factory `createSecretResolver()`.

### 1.3 `AssetStorage` (nuevo, seam)

Intermedia uploads a object storage sin exponer credenciales del storage (FR-017).

```typescript
// src/server/assets/asset-storage.ts
export interface StoredAssetRef {
  readonly url: string;          // URL pública/CDN del asset ya almacenado
  readonly key: string;          // clave interna en el bucket
}

export interface AssetStorage {
  /** Sube un binario ya validado y devuelve su referencia pública. Sin exponer creds del storage. */
  put(input: { key: string; mimeType: string; bytes: Uint8Array }): Promise<StoredAssetRef>;
  /** Alternativa: URL firmada para subida directa acotada (sin creds al cliente). */
  createSignedUploadUrl?(input: { key: string; mimeType: string }): Promise<{ uploadUrl: string; ref: StoredAssetRef }>;
}
```

### 1.4 `AdminAuthGuard` (nuevo, seam — mecanismo en PRD 06)

Puerto que decide si una request admin está autorizada. V1 **default-deny**; PRD 06
conecta el verificador real (SSO/token/roles).

```typescript
// src/server/security/admin-auth-guard.ts
export interface AdminSession {
  readonly subject: string;      // id del administrador (para auditoría, PRD 06)
  readonly roles: readonly string[];
}

export interface AdminAuthGuard {
  /** Autoriza (devuelve la sesión) o lanza/deniega. Sin sesión válida → rechazo (FR-015). */
  authorize(req: { headers: Readonly<Record<string, string | string[] | undefined>> }): Promise<AdminSession>;
}
```

---

## 2. Entidades de frontera (request/response de `/api/*`)

Todas las respuestas están **diseñadas para no transportar secretos** (FR-002/010/016).

| Entidad | Dirección | Endpoint | Forma (sin secretos) | Requisitos |
|---------|-----------|----------|----------------------|------------|
| `PublicTheme` | salida | `GET /api/theme/:slug` | proyección pública de `002` (`slug, displayName, version, tokens, assets, legal, typography`) | FR-007/010, SC-004 |
| `ActivePartnersDto` | salida | `GET /api/partners/active` | `{ slugs: string[] }` (solo slugs activos) | FR-009, consumido por `001` |
| `JourneyRequest` | entrada | `POST /api/journey/:slug/*` | payload del journey (validado) | FR-011/019 |
| `JourneyResponse` | salida | `POST /api/journey/:slug/*` | resultado normalizado de Mashery (sin endpoints/IDs internos) | FR-011/013 |
| `AdminPartnerDto` | salida | `GET /api/admin/partners` | datos del partner + **`credentialConfigured: boolean`** (nunca el secreto) | FR-016 |
| `NewPartnerRequest` | entrada | `POST /api/admin/partners` | alta validada (delega en `createPartner`) | FR-018/019 |
| `AssetUploadResponse` | salida | `POST /api/admin/assets` | `StoredAssetRef` (url/key públicas) | FR-017 |
| `AuditEntryDto` | salida | `GET /api/admin/audit` | historial correlacionado (PRD 06) | FR-021 |

**Nota `ActivePartnersDto`**: el front (`PartnersApiService`) ya acepta
`{ slugs }` **o** `{ partners: [{slug,status}] }`; esta feature emite la forma
canónica `{ slugs }` (solo activos).

---

## 3. Error uniforme (`ApiError`)

Formato único al que se normaliza **todo** fallo (Mashery, validación, autorización),
alineado con el `error-interceptor` del front (ARCHITECTURE §3). Sin trazas ni
detalles internos de Mashery (FR-013, SC-008).

```typescript
// src/server/http/api-error.ts
export interface ApiError {
  readonly code: string;         // estable, mapeable en el front (p. ej. 'mashery_unavailable', 'invalid_input', 'unauthorized')
  readonly message: string;      // seguro para mostrar; NUNCA mensaje crudo de Mashery
  readonly requestId: string;    // correlación (observabilidad, FR-021)
  readonly details?: Readonly<Record<string, string>>; // opcional, sin datos sensibles
}
```

| `code` | HTTP | Origen | Regla |
|--------|------|--------|-------|
| `invalid_input` | 400 | validación de entrada (FR-019) | detalla el campo, no el valor sensible |
| `unauthorized` | 401/403 | `AdminAuthGuard` (FR-015) | sin pistas de por qué |
| `not_found` | 404 | slug/partner inexistente | sin revelar existencia de otros |
| `rate_limited` | 429 | rate limiter (FR-020) | mitiga enumeración |
| `mashery_unavailable` | 502/504 | timeout/breaker abierto (FR-014) | **sin** detalle interno de Mashery |
| `mashery_error` | 502 | error normalizado de Mashery (FR-013) | mensaje genérico + `requestId` |

`normalizeMasheryError(rawError): ApiError` es la función central (D7); ningún handler
construye errores ad-hoc con datos de Mashery.

---

## 4. Reglas de frontera (invariantes)

- **FR-002/010/016** — *Cero secretos en salida*: ninguna respuesta pública ni admin
  contiene `apiKey`, `baseUrl` de Mashery ni IDs de integración. Admin solo expone
  `credentialConfigured: boolean` (vía `SecretResolver.isConfigured`).
- **FR-003/022** — *Allowlist de `TransferState`*: solo `PublicTheme` puede
  serializarse al cliente. `transfer-state-allowlist.ts` valida —server-side— que la
  clave/forma escrita en `TransferState` sea la del theme público; cualquier otro
  campo se rechaza (refuerza la garantía de `003`).
- **FR-005** — *Config vs secreto separados*: theme en SQLite (`PartnerRepository`),
  creds en `SecretResolver`; nunca el mismo almacén ni la misma respuesta.
- **FR-018** — *Solo puerto de repositorio*: ningún handler ejecuta SQL directo.
- **FR-021** — *Trazas sin secretos*: cada request lleva `requestId` y se correlaciona
  por `partnerSlug`; los logs **nunca** incluyen `apiKey`/`extra`/payloads sensibles.

---

## 5. Relación con features vecinas

```
001 resolveTenant ──(slugs activos)──►  GET /api/partners/active  ◄── esta feature emite
002 PartnerRepository ──(puerto)──────►  handlers público/admin    ◄── única vía de datos
002 PublicTheme/toPublicTheme ────────►  GET /api/theme/:slug       ◄── proyección servida
003 TransferState/SSR ────────────────►  allowlist (solo PublicTheme cruza)
005 Back Office ──(consume)───────────►  /api/admin/*               ◄── esta feature expone
006 AuthZ/SSO ──(implementa)──────────►  AdminAuthGuard (seam)      ◄── esta feature define el seam
007 Observabilidad ──(consume)────────►  requestId + traza por partnerSlug
```
</content>
