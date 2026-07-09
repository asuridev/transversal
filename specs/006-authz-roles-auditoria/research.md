# Research: AuthZ, Roles y Auditoría (Back Office)

**Feature**: `006-authz-roles-auditoria` · **Fecha**: 2026-07-05 · **Fase**: 0

Este documento consolida las decisiones técnicas (D1..D12) que resuelven los
`NEEDS CLARIFICATION` del Technical Context del plan. Cada decisión anota
**Decision / Rationale / Alternatives considered**. Todo lo que aquí se fija se
materializa en `data-model.md` y `contracts/`.

Contexto de partida ya presente en el repo (no se reinventa):

- `src/server/security/admin-auth-guard.ts` — puerto `AdminAuthGuard` con
  adaptador **default-deny** V1; PRD 06 conecta el verificador real
  implementando este mismo puerto (seam declarado).
- `src/server/api/admin-router.ts` — ya invoca `guard.authorize({ headers })`,
  llena `req.adminSession` y usa `req.adminSession.subject` como actor; ya expone
  `GET /api/admin/audit`.
- `src/server/persistence/audit.ts` + `audit_log` (schema.ts) — la escritura de
  auditoría ya es **transaccional** dentro del adaptador `PartnerRepository`
  (FR-022 de PRD 05). Esta feature **enriquece** el registro, no lo reimplementa.
- `src/app/core/auth/{auth.store,auth-guard,role-guard}.ts` — seams de front:
  `AuthStore` (NgRx Signals, síncrono), `authGuard`, `roleGuard(role)`.
- `docker-compose.yml` — ya define `sso76-openshift-rhel8:7.6`. El usuario pide
  **podman-compose** con la MISMA imagen en dev y prod (ver D11).

---

## D1 — Librería OIDC del BFF: `openid-client` v6 (panva)

**Decision**: Usar **`openid-client`** (`/panva/openid-client`, v6.x) como único
cliente OIDC del BFF (Node/Express) para: descubrimiento del issuer RH-SSO,
construcción de la URL de autorización con **PKCE S256**, e intercambio del
`code` por tokens con validación de firma (JWKS), `iss`, `aud`, `exp` y `nonce`
del ID Token — todo **server-side**, como cliente confidencial.

**Rationale**:
- Es la implementación de referencia OIDC/OAuth2 para JS (alta reputación,
  certificada OIDC), mantenida por el autor de `jose`. Cubre Authorization Code +
  PKCE + confidential client con `client_secret` en el server exactamente como
  exige PRD 06 §2.
- API v6 basada en funciones (`buildAuthorizationUrl`, `authorizationCodeGrant`
  con `pkceCodeVerifier`/`expectedState`/`expectedNonce`) encaja en handlers
  Express sin acoplar a un framework de auth con opiniones propias.
- No arrastra un session store ni middleware opaco — deja al BFF el control de
  la cookie de sesión (ver D2), que es justo lo que PRD 04/06 requieren.

**Alternatives considered**:
- **`express-openid-connect` (Auth0)**: middleware de más alto nivel, pero impone
  su propio manejo de sesión/cookies y su modelo de config; menos control sobre el
  sellado de sesión y el mapeo claim→rol server-side. Rechazado por acoplamiento.
- **`keycloak-connect` (oficial RH-SSO)**: en mantenimiento mínimo, orientado a
  adaptador Keycloak con sesión en servidor; menos idiomático para el patrón BFF
  con cookie sellada y peor ergonomía en Express 5. Rechazado.
- **OIDC a mano con `jose`**: reinventa discovery/PKCE/validación con más
  superficie de error de seguridad. Rechazado; `openid-client` ya lo encapsula.

---

## D2 — Sesión: cookie httpOnly **sellada (stateless)** con AEAD, sin session store

**Decision**: La sesión del Back Office es una **cookie httpOnly + Secure +
SameSite=Strict** cuyo valor es un *token de sesión sellado* por el BFF con
**AES-256-GCM** (`node:crypto`, cero dependencias nuevas). El payload sellado
contiene: `sub`, `name`, `roles[]` (roles de aplicación ya mapeados, ver D5),
`iat`, `exp`. El **access/ID token del IdP NUNCA se sella ni se envía al
navegador** (FR-002, SC-002): se validan y se descartan tras derivar identidad y
roles.

**Rationale**:
- Un payload sellado AEAD es confidencial + íntegro: el cliente no puede leer ni
  falsificar roles (SC-002, edge "claim manipulado"). Evita una tabla de sesiones
  y su ciclo de vida, coherente con el estilo del repo (SQLite mínimo, sin estado
  de servidor accidental).
- Los roles se **congelan en el sello por login** (D5): satisface FR-014 (roles
  desde el IdP en cada inicio de sesión, sin caché larga desincronizada) porque
  la vida de la cookie es corta (`exp`, ver D3) y en cada re-login se re-derivan.
- `node:crypto` AEAD ⇒ **ninguna dependencia npm nueva** para sesión.

**Alternatives considered**:
- **Session store en SQLite** (tabla `sessions`): permite revocación explícita
  pero añade estado, I/O por request y limpieza de expiradas. Innecesario para V1;
  la expiración corta + `SameSite=Strict` cubre el modelo de amenaza. Rechazado
  por complejidad; anotado como evolución futura si se requiere revocación
  inmediata server-side.
- **JWT firmado (JWS) legible en cliente**: expondría `roles`/`sub` al navegador
  (aunque no manipulables). Rechazado: preferimos **sellado (JWE/AEAD)** para no
  filtrar nada del lado cliente (defensa en profundidad frente a SC-002).
- **`iron-session`/`cookie-session`**: dependencia extra que hace justo lo que
  `node:crypto` AES-GCM ya nos da aquí. Rechazado (regla: mínimo de deps nuevas).

---

## D3 — Vida de sesión y expiración

**Decision**: La cookie de sesión sellada lleva `exp` **absoluto corto** (por
config, default **1 h**). Al expirar o venir inválida/manipulada, toda operación
admin se trata como no autenticada: **401** en `/api/admin/*` de mutación/lectura
server-side, y el front reenvía al flujo de login (edge "sesión expirada durante
operación", SC-004). **No hay refresh silencioso del token del IdP en V1**: al
expirar se re-inicia el flujo OIDC (re-login), lo que re-deriva roles (FR-014).

**Rationale**: Simplicidad y alineación con FR-014 (sin caché larga de permisos).
El re-login contra RH-SSO es barato (sesión SSO viva ⇒ normalmente sin re-teclear
credenciales). Evita gestionar refresh tokens en el server para V1.

**Alternatives considered**: Sliding session / refresh token rotation — mejor UX
en sesiones largas pero añade almacenamiento y rotación de refresh tokens.
Diferido; documentado como evolución.

---

## D4 — Protección CSRF: double-submit token + `SameSite=Strict`

**Decision**: Las mutaciones admin (`POST/PATCH` bajo `/api/admin/*`) exigen
**doble barrera**: (1) cookie de sesión `SameSite=Strict` (ya excluye la mayoría
de CSRF cross-site) y (2) **double-submit CSRF token**: una cookie
`csrf` **legible** (no httpOnly) con un valor aleatorio, que el front reenvía en
la cabecera `X-CSRF-Token`; el BFF compara ambos en cada mutación y rechaza con
**403** si faltan o difieren (FR-013, edge "CSRF en mutaciones"). Token generado
con `crypto.randomBytes` (cero deps).

**Rationale**: Double-submit es apátrida (no requiere store), robusto junto a
`SameSite=Strict` como defensa en profundidad, y encaja con el patrón de
interceptor Angular que ya existe en el repo. El token CSRF **sí** es legible por
JS a propósito (no es un secreto de confidencialidad; su seguridad está en que un
origen ajeno no puede leer la cookie del víctima ni por tanto reflejarla en la
cabecera).

**Alternatives considered**:
- **Synchronizer token pattern** (token en sesión server-side): requiere store de
  sesión (rechazado en D2).
- **Solo `SameSite=Strict`**: insuficiente como única barrera (FR-013 pide
  protección explícita "aun con cookie de sesión válida"). Rechazado.

---

## D5 — Mapeo claim→rol: configuración centralizada del BFF, no hardcode

**Decision**: El BFF mapea el/los claim(s) de rol del IdP (p. ej.
`realm_access.roles` o un claim `roles` custom de RH-SSO) a los roles de
aplicación `platform-admin | partner-editor | auditor` mediante un **mapa de
configuración** cargado de entorno/JSON (`ROLE_CLAIM_PATH` + `ROLE_MAP`), no
embebido en código (FR-004). El claim de origen y su ubicación (`role claim path`)
son configurables para no atarse al esquema exacto de RH-SSO. **Menor privilegio**:
un usuario sin ningún claim mapeable a un rol conocido obtiene `roles: []` ⇒ 403
en toda superficie admin (US2 esc.4, FR-004).

**Rationale**: FR-004 exige mapeo "centralizado y configurable (no embebido en
código)". Config-driven permite alinear con lo que RRHH/IdP emita sin redeploy y
resolver el mapeo **server-side** (edge "claim manipulado": el cliente nunca
decide su rol).

**Alternatives considered**:
- **Claims del IdP == roles de app directamente**: frágil ante renombrados en el
  IdP y acopla nomenclatura. Rechazado.
- **Roles en base de datos por usuario**: contradice FR-014 (fuente de verdad =
  IdP en cada login, sin caché de permisos). Rechazado.

---

## D6 — Adaptador real de `AdminAuthGuard` (reemplaza el default-deny)

**Decision**: Implementar un `createSessionAdminAuthGuard()` que **implementa el
puerto `AdminAuthGuard` existente** leyendo y **desellando la cookie de sesión**
(D2) desde `req.headers.cookie`, devolviendo `AdminSession { subject, roles }`; si
falta/expiró/es inválida ⇒ `throw` (que `admin-router` ya traduce a 401). Además
se extiende `AdminSession` con `name` (displayName legible) para la auditoría
(FR-008). La composition root (`src/server.ts`) pasa a construir este adaptador en
vez de `createAdminAuthGuard()` (default-deny).

**Rationale**: El seam ya está diseñado para esto ("PRD 06 conecta el verificador
real implementando este mismo puerto, sin tocar los handlers de admin-router").
Minimiza el blast radius: `admin-router.ts` no cambia su forma de autorizar.

**Alternatives considered**: Middleware de auth nuevo paralelo al guard — duplica
la frontera ya existente. Rechazado; se respeta el puerto.

---

## D7 — Autorización por rol server-side (RBAC en el BFF)

**Decision**: Sobre el `requireAdminSession` ya presente, añadir
**`requireRole(...roles)`** por endpoint: la lectura (`GET /partners`,
`GET /partners/:id`, `GET /audit`) admite los tres roles; las **mutaciones**
(`POST /partners`, `PATCH /partners/:id`, `publish|deactivate|activate`, `POST
/assets`) exigen `platform-admin` **o** `partner-editor`; la **gestión de theme
default y de otros admins** (cuando exista superficie) exige `platform-admin`. Sin
rol suficiente ⇒ **403** (FR-006, FR-007, US2). El guard de front es solo UX; la
frontera real es esta (FR-006, US2 esc.5).

**Rationale**: Materializa la tabla de roles de PRD 06 §3 en el punto donde vive
la defensa efectiva. La re-verificación server-side por acción cumple "la interfaz
nunca es la única barrera".

**Alternatives considered**: Autorizar solo a nivel de router (todo-o-nada) —
insuficiente para distinguir `auditor` (solo lectura) de editores. Rechazado.

---

## D8 — Auditoría: enriquecer `AuditEntry` con `actorName` y `themeVersion`

**Decision**: Extender el `AuditEntry` de `src/server/persistence/audit.ts` y la
tabla `audit_log` con **`actor_name`** (nombre legible del actor, FR-008 y US3
esc.4) y **`theme_version`** (versión resultante cuando aplica, FR-008/FR-012,
US3 esc.1). Alinear la nomenclatura de acción de PRD 06 (`update`) con la del repo
(`save_version`) documentando el mapeo (ver `data-model.md`). El `diff` pasa a
estructurarse como `Record<field, { from, to }>` serializado en el `diff` JSON ya
existente. La escritura sigue siendo **append-only y transaccional** con la
mutación (FR-009/FR-010): el adaptador ya lo garantiza; esta feature solo añade
columnas y las puebla.

**Rationale**: `audit.ts` ya modela id/at/actorSub/diff transaccional; faltan
`actorName` y `themeVersion` para cumplir FR-008/FR-012 y US3 esc.1/4. La
inmutabilidad ya está dada por la ausencia de UPDATE/DELETE sobre `audit_log`
(solo INSERT en el adaptador).

**Alternatives considered**:
- **Tabla nueva de auditoría**: duplicaría `audit_log`. Rechazado; se extiende.
- **Guardar el nombre solo por `sub` y resolverlo al leer**: el nombre puede
  cambiar en el IdP; FR-008 pide registrar la identidad legible **en la entrada**.
  Rechazado; se persiste `actor_name` en el momento de la mutación.

---

## D9 — Consulta de auditoría con filtros (partner, actor, rango de fechas)

**Decision**: Extender `AuditQuery` (`{ limit, offset }`) con
**`entityId?` (partner), `actorSub?`, `from?`, `to?` (ISO-8601)** y aplicar los
filtros en el adaptador SQLite (WHERE + índices). `GET /api/admin/audit` acepta
esos filtros por query-string y **exige rol `auditor` o `platform-admin`** (D7,
FR-011, US4 esc.3 ⇒ 403 sin rol de lectura de auditoría). La reconstrucción del
"estado de marca vigente en fecha X" (SC-008, US4 esc.4) se resuelve **por
consulta** cruzando `theme_version` de las entradas `publish` con
`partner_themes.version` (no requiere columna nueva).

**Rationale**: FR-011/FR-012 y US4. Filtrar en SQL (no en memoria) es correcto y
barato con índices sobre `(entity_id)`, `(actor_sub)`, `(at)`.

**Alternatives considered**: Filtrado en el front sobre el listado completo —
no escala y expone datos de más al cliente. Rechazado.

---

## D10 — Front: bootstrap de sesión, `AuthStore` con `roles[]`, `roleGuard` variádico

**Decision**:
- Extender `AuthUser` de `role: string` a **`roles: readonly string[]`** y añadir
  `name`. `AuthStore` gana `hasAnyRole(...roles)` (computed/method) — sigue siendo
  **estado síncrono** (NgRx Signals, Const. §2).
- `roleGuard` pasa a **variádico** `roleGuard(...roles)` (hoy es `roleGuard(role)`)
  para soportar `roleGuard('platform-admin','partner-editor','auditor')` de PRD 06
  §4; sin match ⇒ `/forbidden`.
- **Bootstrap**: al arrancar, el front resuelve la sesión vía **TanStack Query**
  (`AuthQueries.session()` → `AuthApiService.getSession()` → `GET /api/admin/session`)
  y en `onSuccess` hace `AuthStore.setUser(...)` (patrón login de ARCHITECTURE §3).
  `authGuard` sigue leyendo `AuthStore` (síncrono). Si `GET /session` responde 401,
  el front inicia el flujo de login (redirige a `GET /api/auth/login`).
- Interceptor CSRF (front): un `HttpInterceptorFn` adjunta `X-CSRF-Token` (leído
  de la cookie `csrf`) a las mutaciones `/api/admin/*` (D4).

**Rationale**: Cumple Constitución I (server-state por TanStack Query; el store
solo guarda estado síncrono derivado), II–IV (guards funcionales, `inject()`,
zoneless). Reusa los seams `authGuard`/`roleGuard`/`AuthStore` ya existentes,
extendiéndolos mínimamente.

**Alternatives considered**:
- **Inyectar `HttpClient` en el guard/store para el whoami**: viola Const. I.
  Rechazado; se usa la capa `queries/ → *ApiService → HttpClient`.
- **Guardar roles en `localStorage`**: viola el modelo (roles viven en la cookie
  sellada server-side; el front solo refleja lo que `/session` reporta). Rechazado.

---

## D11 — Infra de desarrollo: **podman-compose** con `sso76-openshift-rhel8:7.6`

**Decision**: Añadir **`infra/sso/podman-compose.yml`** que levanta
`registry.redhat.io/rh-sso-7/sso76-openshift-rhel8:7.6` (misma imagen/versión en
dev y prod, requisito del usuario) con **import automático de realm** de desarrollo
(`infra/sso/realm/backoffice-realm.json`): realm `backoffice`, cliente
confidencial `backoffice-bff` (Authorization Code + PKCE, `redirect_uri` al BFF),
roles de realm `platform-admin`/`partner-editor`/`auditor`, y usuarios de prueba
(uno por rol). El `client_secret` de dev se inyecta por variable/segreto y en el
BFF se resuelve vía el `SecretResolver`/entorno existente (nunca al cliente). Se
conserva `docker-compose.yml` como equivalente Docker; `podman-compose` es el
camino soportado en dev por indicación del usuario.

**Rationale**: El usuario pide explícitamente podman-compose y **paridad dev/prod**
en el servidor de autorización. El import de realm hace el entorno reproducible
(`quickstart.md`). Usar la misma imagen elimina deriva de comportamiento OIDC entre
entornos.

**Alternatives considered**:
- **Keycloak upstream (quay.io/keycloak) en dev**: divergiría de RH-SSO 7.6 de
  prod (versiones/claims). Rechazado por romper paridad (el usuario lo prohíbe
  implícitamente).
- **Solo el `docker-compose.yml` actual**: no cumple la petición (podman) ni
  automatiza realm/roles/usuarios de prueba. Se complementa, no se sustituye.

---

## D12 — Variables de entorno y secretos del OIDC

**Decision**: El BFF lee de entorno (vía el patrón `environment`/secret resolver
ya existente, ARCHITECTURE §8 y `secrets/`): `OIDC_ISSUER_URL`,
`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (secreto), `OIDC_REDIRECT_URI`,
`OIDC_POST_LOGOUT_REDIRECT_URI`, `SESSION_SEAL_KEY` (32 bytes, secreto para AEAD),
`ROLE_CLAIM_PATH`, `ROLE_MAP` (JSON), `SESSION_TTL_SECONDS`. El `client_secret` y
`SESSION_SEAL_KEY` viven en el gestor de secretos (PRD 04 §5), **nunca** en el
bundle ni en el cliente.

**Rationale**: Coherente con la política de secretos del repo (`secrets/`,
`env-secret-resolver`) y con FR-002/PRD 04. Config-driven habilita D5 y la paridad
dev/prod (mismos nombres de var, distintos valores).

**Alternatives considered**: Config hardcoded o en archivo versionado — filtra
secretos y contradice PRD 04. Rechazado.

---

## Resumen de dependencias nuevas

| Dependencia | Ámbito | Motivo | ¿Nueva? |
|-------------|--------|--------|---------|
| `openid-client` v6 | BFF (Node) | Flujo OIDC Code+PKCE server-side (D1) | **Sí (única npm nueva)** |
| `node:crypto` (AES-256-GCM, randomBytes) | BFF | Sellado de sesión (D2) + CSRF (D4) | No (built-in) |
| `node:sqlite` `DatabaseSync` | BFF | Filtros de auditoría (D9) | No (ya usado) |
| RH-SSO `sso76-openshift-rhel8:7.6` | Infra dev/prod | IdP OIDC (D11) | No (imagen ya referenciada) |
| `podman-compose` | Infra dev | Levantar el IdP (D11) | Herramienta, no dep de app |

Sin `axios` (Const. I): las llamadas server↔IdP las hace `openid-client`; el
front usa `HttpClient` vía `queries/` (D10). Ninguna librería CSS nueva; el front
solo añade lógica (guards/interceptor/query), no UI de marca nueva salvo la página
`/forbidden` que ya existe.
</content>
</invoke>
