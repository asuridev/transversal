# PRD 04 — Arquitectura BFF (Backend for Frontend)

> **Depende de:** [02 Modelo/Theme](./02-modelo-de-partner-y-contrato-de-theme.md)
> (contratos y persistencia).
> **Habilita:** [03 Theming](./03-theming-dinamico-y-anti-fouc.md) (SSR + caché),
> [05 Back Office](./05-back-office-gestion-de-partners.md) (endpoints admin),
> [06 AuthZ/Auditoría](./06-authz-roles-y-auditoria.md) (validación de token).

---

## 1. Objetivo

Definir la **capa Backend-for-Frontend** que media entre el front y
Mashery: sus responsabilidades, endpoints, **gestión segura
de secretos**, orquestación de llamadas **por partner**, manejo de errores y su
rol en el SSR/anti-FOUC. Regla dura: **ningún token, API key o ID sensible de
integración llega jamás al browser.**

---

## 2. Decisión: BFF = Angular SSR (Node) en el mismo repo

(Decisión 2, PRD 00.) El servidor de Angular SSR (`server.ts` + route handlers
Node) **es** el BFF. Un solo repo, un solo deploy.

### Por qué

- **Cohesión y anti-FOUC:** el mismo proceso que renderiza SSR resuelve el
  theme y lo inyecta en el HTML (PRD 03 §5) — sin salto de red extra.
- **Un artefacto, un pipeline:** menos superficie operativa que un
  microservicio aparte.
- **TransferState nativo:** el estado resuelto en server hidrata el cliente sin
  duplicar lógica.

```
┌────────────────────── Deploy único (Node) ─────────────────────────┐
│                                                                     │
│  Angular SSR (server.ts)                                            │
│    ├─ render de la app (con theme inyectado)                        │
│    └─ BFF route handlers  (/api/*)                                  │
│         ├─ /api/theme/:slug         (público, cacheado)             │
│         ├─ /api/partners  (admin)   (protegido, PRD 06)             │
│         └─ /api/journey/* (proxy a Mashery de seguros por partner)  │
│                                                                     │
│  Secret Manager (env / vault)  ◄── credenciales por partner         │
│  SQLite local ──Litestream (single-node)──► bucket (respaldo)       │
│      · lecturas y escrituras: instancia única, vía PartnerRepository│
│  Object storage + CDN  ◄── assets (PRD 02)                          │
└─────────────────────────────────────────────────────────────────────┘
        ▲ solo HTTPS con contrato público          ▼ credenciales reales
     Browser (front)                                     Mashery
```

El browser **solo** habla con `/api/*` del BFF. El BFF es quien habla con
Mashery usando credenciales del server. En V1 hay **una sola instancia** que lee
y escribe su **SQLite local** (sin salto de red), siempre **a través del puerto
`PartnerRepository`** (PRD 02 §5); no hay enrutamiento de escrituras ni
primaria/réplica. **Litestream single-node** respalda el SQLite al bucket de
forma continua y lo **restaura al arrancar**. El escalado a varias instancias se
resuelve **migrando a Postgres** cambiando el adaptador del puerto (PRD 02 §5).

---

## 3. Responsabilidades del BFF

1. **Servir el theme público** por slug (proyección sin datos sensibles,
   PRD 02 §3), con caché (PRD 03 §6).
2. **CRUD de partners** para el Back Office (protegido por SSO, PRD 06).
3. **Orquestar el journey de venta** contra Mashery de
   seguros, **inyectando las credenciales/endpoints del partner** del lado
   server.
4. **Guardar y aplicar secretos** por partner (nunca al cliente).
5. **Intermediar uploads** de assets a object storage (URLs firmadas o proxy).
6. **Observabilidad**: logging de errores y trazas correlacionadas por
   `partnerSlug` (PRD 07).

El BFF accede a la persistencia **solo** a través del puerto `PartnerRepository`
(PRD 02 §5) — ningún handler ejecuta SQL directo.

---

## 4. Endpoints (contrato)

### Públicos (front / experiencia)

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/api/theme/:slug` | Theme público del partner activo | no (público, cacheable) |
| GET | `/api/partners/active` | Lista de slugs activos (para el resolver, PRD 01) | no |
| POST | `/api/journey/:slug/*` | Proxy orquestado a Mashery de seguros | sesión de journey |

### Admin (Back Office) — protegidos por SSO (PRD 06)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/partners` | Listar partners (con estado, buscador) |
| POST | `/api/admin/partners` | Crear partner |
| PATCH | `/api/admin/partners/:id` | Editar partner/theme (crea versión, PRD 02) |
| POST | `/api/admin/partners/:id/publish` | Publicar versión de theme |
| POST | `/api/admin/partners/:id/deactivate` | Baja lógica |
| POST | `/api/admin/assets` | Intermediar upload a object storage |
| GET | `/api/admin/audit` | Historial de auditoría (PRD 06) |

**Regla:** las respuestas públicas nunca incluyen credenciales, endpoints
internos, ni IDs de integración. Las respuestas admin tampoco devuelven
secretos en claro (solo metadatos: "credencial configurada sí/no").

---

## 5. Gestión de secretos (requisito crítico)

- **Fuente:** secret manager (Vault / AWS Secrets Manager / GCP Secret Manager
  / Azure Key Vault) o variables de entorno inyectadas en runtime. **Nunca**
  hardcodeadas ni en el repo (Constitución de seguridad; PRD 00 §7).
- **Mapa por partner:** cada partner puede tener **credenciales y endpoints
  propios** hacia Mashery. El BFF resuelve `partnerSlug → { endpoint, apiKey,
  … }` desde el secret manager en el server, **por request**, y nunca lo
  serializa hacia el cliente ni al `TransferState`.
- **Rotación:** las credenciales se rotan en el secret manager sin redeploy;
  el BFF las lee en caliente (con cache corta e invalidación).
- **Separación de config vs secreto:** el theme (config visual, PRD 02) vive en
  **SQLite** (respaldada en el bucket vía Litestream single-node); los
  **secretos de integración** viven en el secret manager. Nunca se mezclan en el
  mismo store.

```typescript
// conceptual — resolución server-side, jamás cruza al browser
async function partnerIntegration(slug: string): Promise<IntegrationCreds> {
  return secretManager.get(`partner/${slug}/integration`); // { baseUrl, apiKey, ... }
}
```

---

## 6. Orquestación por partner

- El BFF traduce las acciones del journey del front en llamadas a Mashery de
  seguros, **usando el endpoint y credenciales del partner**.
- **Sin `axios`** en el proyecto Angular (Constitución regla 1) — aplica al
  front; en el runtime server del BFF se usa el cliente HTTP nativo de Node
  (`fetch`/`undici`) o `HttpClient` de Angular en contexto server, según el
  wiring de SSR. La regla anti-axios protege el **bundle del cliente**.
- **Normalización de errores:** el BFF mapea errores de Mashery a un formato de
  error uniforme para el front (alineado con el `error-interceptor`,
  `ARCHITECTURE.md` §3), sin filtrar detalles internos de Mashery.

---

## 7. Seguridad de la frontera

- **Nada sensible en el bundle ni en el network tab** (PRD 00 §7): el contrato
  público está diseñado para no contener secretos, y el `TransferState` solo
  transporta el theme público.
- **Rate limiting** en endpoints públicos (mitiga enumeración de slugs, PRD 01
  §10).
- **Validación de entrada** en todos los endpoints (slug, payloads de theme,
  uploads).
- **CORS**: al ser mismo origen (path prefix, un dominio), la superficie CORS
  es mínima; los `/api/*` se sirven del mismo host que la app.

---

## 8. Requisitos funcionales

- **RF-04.1** El browser solo se comunica con `/api/*` del BFF.
- **RF-04.2** `/api/theme/:slug` devuelve el contrato público sin secretos.
- **RF-04.3** Los secretos por partner se leen del secret manager en server y
  nunca se serializan al cliente ni al `TransferState`.
- **RF-04.4** El BFF orquesta el journey inyectando credenciales/endpoint del
  partner del lado server.
- **RF-04.5** Endpoints admin protegidos por SSO (PRD 06); no devuelven
  secretos en claro.
- **RF-04.6** Errores de Mashery normalizados; sin fuga de detalles internos.
- **RF-04.7** Caché server-side del theme con `Cache-Control` para CDN.

---

## 9. Criterios de aceptación

- [ ] Inspeccionar el bundle y el network tab del browser **no** revela ninguna
      API key, endpoint de Mashery ni ID de integración.
- [ ] `GET /api/theme/:slug` responde el shape del PRD 02 §3, cacheado.
- [ ] Una acción del journey golpea Mashery con las credenciales del partner
      correcto, resueltas en server.
- [ ] Rotar una credencial en el secret manager surte efecto sin redeploy.
- [ ] Un endpoint admin sin token válido responde 401/403 (PRD 06).
- [ ] Tests del BFF cubren: proyección pública, resolución de secretos
      (mockeada), normalización de errores (PRD 00 §7 exige tests del BFF).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Secreto filtrado por accidente al `TransferState` | Allowlist explícita de campos serializables (solo theme público). |
| Mashery lento degrada el journey | Timeouts, reintentos acotados y circuit breaker en el BFF. |
| Un partner mal configurado apunta a credencial equivocada | Validación en alta + prueba de conectividad server-side (PRD 05). |
| Escalado del SSR bajo carga | V1: lecturas del theme desde SQLite local + caché/CDN; el escalado horizontal se habilita migrando a Postgres (PRD 02 §5, PRD 07 §3). |
| Reinicio/caída de la instancia (V1 single-node) | Restore desde el bucket (Litestream) al arrancar (PRD 02 §5); escrituras raras acotan el impacto. |
