# Autenticación y Autorización — Back Office (features `006-authz-roles-auditoria` + `007-aislamiento-asesor-partner` + `008-login-externo-transferencia-sesion` + `009-webview-login-experiencia-usuario`)

Este documento explica **cómo funciona** el mecanismo de login SSO, sesión y
autorización por roles del Back Office, qué archivos/funciones intervienen en
cada paso, y **cómo probarlo manualmente** con los usuarios de prueba.

**Punto de entrada (008/009)**: el login de **todos** los usuarios ya **no**
inicia en la transversal, sino en una app Angular **independiente y en otro
dominio**, `webview-login` (repo hermano), asociada a un **segundo cliente OIDC
del mismo reino** `backoffice`. La transversal **no reimplementa el login**:
conserva su flujo OIDC (Code+PKCE) y lo completa de forma **silenciosa** (silent
SSO) cuando el usuario llega desde webview-login. **No se transfiere ningún
token ni cookie de sesión entre las dos apps** — lo único compartido es la
**sesión de identidad del reino**; cada app mantiene su propia sesión local. El
detalle de este handoff está en §2.5.

**Principio rector**: la UI (guards de Angular) es solo **UX**. La barrera de
seguridad real vive **siempre en el BFF** (Node/Express) — cada request a
`/api/admin/*` (y a `/api/journey/*`) se re-verifica server-side, sin excepción.
webview-login solo **decide qué pantalla mostrar** (admin vs. cards de asesor);
la autorización real (rol, partner activo, resolución de módulo) permanece
server-side en la transversal (009).

A partir de la feature **007**, la cookie de sesión sellada puede portar el
vínculo **asesor→partner** (`partnerId`/`partnerSlug`), y existe una **frontera
de aislamiento por partner** también server-side sobre `POST /api/journey/:slug/*`.
Aquí se documenta cómo eso afecta a la sesión y su siembra en SSR; el detalle
completo de esa frontera está en las specs de 007 (ver §10).

---

## 1. Resumen ejecutivo

- **Entrada única en webview-login + transferencia de sesión (008/009)**: la
  pantalla de login vive en `webview-login` (app Angular independiente, **otro
  dominio**, repo hermano), asociada a un **segundo cliente OIDC** del **mismo
  reino** `backoffice`. **No hay transferencia literal de token ni de sesión
  entre las apps**: lo único compartido es la **sesión de identidad del reino**.
  El usuario se autentica en webview-login (creando esa sesión de reino) y luego
  navega a `GET /api/auth/login` de la transversal, cuyo flujo OIDC se completa
  **sin pedir credenciales** (silent SSO) precisamente porque el reino ya tiene
  sesión. Cada app conserva su **propia** cookie local (`bo_session` de la
  transversal es `SameSite=Strict` y **nunca** cruza de dominio). Ver §2.5.
- **Bifurcación admin vs. asesor (009)**: tras autenticarse en webview-login, el
  **administrador** (rol de Back Office) es redirigido **de inmediato** a la
  transversal (`?module=admin` → `/admin`), **sin** ver la página de cards; el
  **asesor** ve una **página de cards modulares** themeada con el branding de su
  partner (vía CORS, §2.5), y el clic en cualquier card lo lleva al shell
  `/:partnerSlug` de la transversal. (009 reemplaza el punto de 008 que hacía a
  los admins pasar también por cards con tema neutro.)
- **Autenticación**: OIDC Authorization Code + PKCE contra un IdP corporativo
  (RH-SSO 7.6), mediado por el BFF. El navegador **nunca** recibe el
  access/ID token del IdP — solo una cookie de sesión propia, sellada y
  httpOnly.
- **Autorización**: cada endpoint de `/api/admin/*` exige una sesión válida
  (401 si no) y un rol de aplicación suficiente (403 si no). Las mutaciones
  además exigen un token CSRF (double-submit).
- **Roles de aplicación**: `platform-admin`, `partner-editor`, `auditor` —
  derivados de los claims del IdP mediante un mapeo configurable, nunca
  hardcodeados.
- **Vínculo asesor→partner (007)**: la sesión sellada porta, **opcionalmente**,
  `partnerId`/`partnerSlug` cuando el usuario es un **asesor** — derivado de un
  claim del IdP (`PARTNER_CLAIM_PATH`) y validado contra el catálogo de partners
  activos en el callback. Es lo que habilita el aislamiento por partner del
  journey de venta (frontera server-side, `require-partner-scope`).
- **Auditoría**: cada mutación deja una entrada enriquecida (actor técnico +
  legible, acción, diff, versión de theme si aplica), de forma atómica con la
  mutación. Los intentos de **acceso cruzado entre partners** (007) también se
  auditan (append-only, `entity:'access'`/`action:'cross_partner_denied'`).
- **Soporte server-side del handoff (008)**: un **catálogo de módulos**
  server-side (`module-catalog.ts`) resuelve `moduleId → ruta` con disponibilidad
  por rol/partner (nunca una ruta propuesta por el cliente); el logout pasa a ser
  **RP-initiated** (`POST /api/auth/logout` termina también la sesión del reino y
  redirige de vuelta a webview-login); y el tema del partner se sirve con **CORS**
  acotado para que webview-login lo consuma cross-origin al themear sus cards. Ver
  §2.5.

---

## 2. Flujo completo (login SSO)

**Punto de entrada**: el usuario inicia en **webview-login** (§2.5), se autentica
contra el cliente OIDC `webview-login` (creando la sesión de reino) y desde ahí
navega a `GET /api/auth/login?module=<id>` de la transversal. Ese `GET` es donde
arranca el diagrama de abajo — el resto del flujo OIDC de la transversal es el que
siempre existió (PKCE, callback, sellado de sesión), solo que ahora se completa
**sin prompt de credenciales** porque el reino ya tiene sesión. Llegar directo a
`/admin` sin sesión es solo un **fallback**: el `authGuard` (front, UX) redirige el
navegador a webview-login, no muestra login propio.

```
Browser                          BFF (Express)                    IdP (RH-SSO 7.6)
  │  (ya autenticado en webview-login: sesión de reino creada — §2.5)     │
  │  navega a la transversal:         │                                   │
  │  GET /api/auth/login?module=<id>  │                                   │
  │───────────────────────────────────▶ buildAuthorizationRequest()       │
  │                                   │  (PKCE S256 + state + nonce)      │
  │                                   │  sella {codeVerifier,state,nonce, │
  │                                   │   returnTo} en cookie bo_oidc_tx  │
  │◀── 302 a authorization_endpoint ──│                                   │
  │───────────────────────────────────────────────────────────────────────▶
  │                    sesión de reino YA existe (webview-login) ⇒ SIN     │
  │                    prompt de credenciales (silent SSO)                 │
  │◀──────────────────────────── 302 a /api/auth/callback?code=..&state=..
  │  GET /api/auth/callback ─────────▶│                                   │
  │                                   │  lee bo_oidc_tx, exchangeAuthorizationCode()
  │                                   │  (valida firma JWKS/iss/aud/exp/nonce)
  │                                   │  deriveRoles(claims, ROLE_MAP)    │
  │                                   │  derivePartnerRef(claims, PARTNER_CLAIM_PATH) (007)
  │                                   │  valida partner activo (si no ⇒ 302 /forbidden)
  │                                   │  sella bo_session (AES-256-GCM)   │
  │                                   │   (+ partnerId/partnerSlug si asesor)
  │                                   │  emite csrf, borra bo_oidc_tx     │
  │◀── 302 a returnTo (o /admin) ─────│  + Set-Cookie: bo_session, csrf   │
  │  (SSR ya sembró la sesión: ver §4.1 — el whoami es refresco)          │
  │  GET /api/admin/session ─────────▶│  (whoami)                        │
  │◀ 200 {subject,name,roles,partnerId?,partnerSlug?} ─────────────────── │
  │  AuthStore.setUser(dto)           │                                   │
  │                                   │                                   │
  │  Cada request a /api/admin/*:     │                                   │
  │  requireAdminSession(401) → requireCsrf en mutaciones(403)            │
  │    → requireRole(...)(403) → handler                                 │
  │  Cada request a /api/journey/:slug/* (007):                          │
  │  requirePartnerScope: 401 sin sesión → 404 en cruce (+auditoría)     │
  │    → orquesta con el partner de la SESIÓN, no el :slug del cliente    │
```

**El access/ID token del IdP se valida y se descarta dentro de
`GET /api/auth/callback`** — nunca se sella, nunca cruza al navegador.

En el callback, tras `deriveRoles`, si el claim de partner
(`PARTNER_CLAIM_PATH`) está presente se resuelve `derivePartnerRef` y se valida
contra el catálogo: **si el partner no existe o está inactivo, no se emite
sesión** (302 `/forbidden`, falla segura — FR-008 de 007). Un usuario **sin**
claim de partner (admin de Back Office) sella una sesión sin `partnerId/slug`,
sin cambio de comportamiento respecto a 006.

### 2.1 `buildAuthorizationRequest` — qué construye exactamente (`oidc-flow.ts`)

```ts
export async function buildAuthorizationUrl(config, redirectUri) {
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { url, codeVerifier, state, nonce };
}
```

- `codeVerifier` es un secreto aleatorio que **nunca sale del BFF** — vive
  sellado en `bo_oidc_tx` hasta que vuelve el callback.
- `codeChallenge = SHA256(codeVerifier)` (S256) es lo único que viaja en la
  URL de autorización. Aunque un atacante interceptara esa URL, no puede
  derivar el `codeVerifier` desde el challenge (PKCE = *Proof Key for Code
  Exchange*, RFC 7636) — así se evita que un `code` interceptado sea
  canjeable por otro cliente.
- `state` protege contra CSRF sobre el propio flujo de login (el callback
  solo se acepta si el `state` que vuelve coincide con el que se guardó).
- `nonce` liga el ID Token emitido a esta transacción específica (mitiga
  *replay* de un ID Token válido pero de otra sesión de login).

### 2.2 `authorizationCodeGrant` — qué valida `openid-client` (`oidc-flow.ts`)

```ts
export async function authorizationCodeGrant(config, currentUrl, checks) {
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: checks.pkceCodeVerifier,
    expectedState: checks.expectedState,
    expectedNonce: checks.expectedNonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims) throw new Error('OIDC callback sin ID Token válido');
  return claims;
}
```

`client.authorizationCodeGrant` (de `openid-client`, implementación de
referencia OIDC) hace, en un solo paso:

1. Verifica que `state` en la URL de retorno coincide con `checks.expectedState`.
2. Intercambia el `code` por tokens en el `token_endpoint` del IdP, usando
   autenticación de cliente confidencial (`client_secret`).
3. Valida el **ID Token** recibido: firma (contra las JWKS publicadas por el
   IdP, `jwks_uri`), `iss` (coincide con el issuer configurado), `aud`
   (coincide con `client_id`), `exp`/`iat` (no vencido, no futuro), y `nonce`
   (coincide con `checks.expectedNonce`).
4. Verifica el PKCE `code_verifier` contra el `code_challenge` enviado en el
   paso de autorización.

Solo si **todo** eso pasa, `tokens.claims()` devuelve el payload del ID
Token. **El objeto `tokens` completo (con `access_token`/`id_token` crudos)
se descarta al salir de la función** — el llamador (`auth-router.ts`) solo
recibe `claims`, nunca los tokens. Esto materializa FR-002/SC-002 a nivel de
código, no solo de contrato.

### 2.3 `deriveRoles` — el algoritmo real (`role-map.ts`)

```ts
function readClaimPath(claims, path) {
  return path.split('.').reduce((value, segment) => {
    if (value === null || typeof value !== 'object') return undefined;
    return value[segment];
  }, claims);
}

export function deriveRoles(claims, config) {
  const rawValue = readClaimPath(claims, config.roleClaimPath);
  const rawRoles = Array.isArray(rawValue) ? rawValue : [];

  const roles = [];
  for (const raw of rawRoles) {
    if (typeof raw !== 'string') continue;
    const mapped = config.roleMap[raw];
    if (mapped && !roles.includes(mapped)) roles.push(mapped);
  }
  return roles;
}
```

- `roleClaimPath` es una ruta con notación de puntos (p. ej.
  `realm_access.roles`), resuelta con un `reduce` que navega el objeto de
  claims nivel a nivel — si en cualquier punto el valor no es un objeto,
  devuelve `undefined` (no lanza).
- Si el claim resuelto no es un array, `rawRoles = []` — el resultado final
  es `[]`, no un error.
- Cada claim del IdP se busca en `ROLE_MAP` (config de entorno); **si no
  está mapeado, se ignora silenciosamente** — no hay "rol por defecto"
  distinto de la ausencia de roles. Esto es el mecanismo concreto de "menor
  privilegio por defecto" (D5, FR-004): un usuario con claims que no
  coinciden con ningún valor de `ROLE_MAP` termina con `roles: []`, y por
  tanto 403 en todo `/api/admin/*`.
- El `!roles.includes(mapped)` deduplica sin usar `Set` (mantiene el orden
  de primera aparición, relevante solo para legibilidad/tests, no para la
  autorización en sí — `requireRole` usa `.some()`, no importa el orden).

### 2.4 Flujo del asesor (007) — vínculo a partner y frontera del journey

El **asesor** de un partner (p. ej. `banco-a`) **no opera el Back Office**: su
token del IdP **no trae rol de aplicación** (`roles: []`), sino un **claim de
partner** (`PARTNER_CLAIM_PATH`, p. ej. `partner: "banco-a"`). Su meta es operar
el **journey de venta** de su partner, aislado de los demás.

Las **mecánicas OIDC son idénticas** a las del admin (PKCE S256 + `state` +
`nonce` + `bo_oidc_tx`, ver §2.1/§2.2). La **entrada** también es la misma que la
del admin (008/009): el asesor se autentica en **webview-login**, ve su **página
de cards** themeada por su partner (§2.5) y, al hacer clic en una card, el
navegador va a `GET /api/auth/login?module=<id>`, que la transversal resuelve al
shell `/:partnerSlug`. Lo que **cambia** frente al admin está en el callback
(derivación y validación del partner) y en la frontera que protege sus requests
(`/api/journey/*` en vez de `/api/admin/*`):

```
Browser (asesor)                 BFF (Express)                    IdP (RH-SSO 7.6)
  │  autenticado en webview-login → click en una card (tema del partner)  │
  │  ──▶ GET /api/auth/login?module=<id>  (resuelve a /<partnerSlug>)      │
  │──────────────────────────────────▶│  (idéntico a §2: PKCE+state+nonce,
  │◀── 302 a authorization_endpoint ──│   sella bo_oidc_tx)               │
  │───────────────────────────────────────────────────────────────────────▶
  │              sesión de reino ya existe ⇒ silent SSO (token con claim partner)
  │◀──────────────────────────── 302 a /api/auth/callback?code=..&state=..
  │  GET /api/auth/callback ─────────▶│                                   │
  │                                   │  exchangeAuthorizationCode() (§2.2)
  │                                   │  deriveRoles → []  (no es admin)  │
  │                                   │  derivePartnerRef(claims, PARTNER_CLAIM_PATH) → "banco-a"
  │                                   │  findBySlug("banco-a")            │
  │                                   │   ├─ activo   → sella bo_session   │
  │                                   │   │             (+partnerId/partnerSlug)
  │                                   │   └─ inexistente/inactivo → 302 /forbidden (SIN sesión)
  │◀ 302 a la ruta resuelta (/banco-a) │  + Set-Cookie: bo_session, csrf  │
  │  (SSR desella bo_session → AuthStore con partnerSlug; ver §4.1)       │
  │                                   │                                   │
  │  Guard UX de front (partnerScopeMatch):                              │
  │   ruta /banco-b con sesión de banco-a ⇒ redirige a /banco-a (no es la frontera)
  │                                   │                                   │
  │  Operar el journey: POST /api/journey/:slug/*                        │
  │───────────────────────────────────▶ requirePartnerScope:            │
  │      1) sin sesión ................................ 401              │
  │      2) sesión sin partner (admin) ................ 404              │
  │      3) :slug ≠ partner de la sesión (cruce) ...... 404 + auditoría  │
  │                                     (cross_partner_denied, sin fuga) │
  │      4) partner de la sesión ya inactivo .......... 404              │
  │      5) match ⇒ orquesta con el partner de la SESIÓN, no el :slug    │
```

**Diferencias respecto al flujo admin (§2), paso a paso:**

1. **Derivación del partner (callback)** — tras `deriveRoles`, el BFF llama a
   `derivePartnerRef(claims, PARTNER_CLAIM_PATH)` (`partner-claim.ts`). La
   cardinalidad es **exactamente-uno**: claim único ⇒ slug; ausente/vacío/múltiple/
   tipo inválido ⇒ `null` (menor privilegio, nunca se elige uno arbitrariamente).
   Un **admin** no trae el claim ⇒ `null` ⇒ sesión sin partner (comportamiento 006
   intacto).

2. **Validación contra el catálogo (deny seguro)** — si `partnerRef` no es `null`,
   el BFF hace `partnerRepository.findBySlug(ref)` y exige que exista **y** esté
   `active`. Si no (partner inexistente o dado de baja), **no se emite sesión**:
   302 `/forbidden`, se limpia `bo_oidc_tx` (FR-008, caso `asesor-inactivo`). Así,
   un vínculo inválido nunca produce una sesión utilizable.

3. **Sesión con partner** — solo en el happy path se sella `bo_session` **con**
   `partnerId`/`partnerSlug` (además de `sub`/`name`/`roles`). Es lo que lee el
   front (SSR, §4.1) y lo que la frontera del journey trata como **autoritativo**.

4. **Guard UX de front (`partnerScopeMatch`, 007)** — al navegar a la ruta de
   **otro** partner, compara el tenant de la ruta con `AuthStore.partnerSlug` y
   redirige al partner propio. Es solo UX (evita mostrar una vista ajena); **la
   seguridad real la impone el BFF** aunque se fuerce la URL.

5. **Frontera del journey (`require-partner-scope.ts`, la barrera real)** — cada
   `POST /api/journey/:slug/*` pasa por `requirePartnerScope` **antes** del
   handler:
   - sin sesión ⇒ **401**;
   - sesión sin partner (p. ej. un admin) ⇒ **404** (no puede operar el journey);
   - `:slug` **distinto** al partner de la sesión (intento de cruce) ⇒ **404
     `not_found`** — indistinguible de "no existe", **sin enumeración** ni fuga de
     datos del partner ajeno — y se **audita** el intento (`appendAccessDenied` →
     `entity:'access'`, `action:'cross_partner_denied'`, FR-011);
   - partner de la sesión que **dejó de estar activo** ⇒ **404** (se re-valida en
     cada request, no se confía en la sesión sola);
   - solo si **coincide** y sigue activo, adjunta `req.partner` y continúa.

6. **El identificador del cliente se ignora** — el handler orquesta usando
   `req.partner.slug` (derivado de la **sesión**), **nunca** el `:slug` de la URL
   ni un `partnerId` del cuerpo. Enviar `banco-a` en la URL con
   `{ "partnerId": "banco-b" }` en el body orquesta `banco-a` (FR-005).

> **Resumen**: el asesor comparte con el admin toda la mediación OIDC (tokens del
> IdP validados y descartados, sesión sellada, cero tokens al navegador), pero su
> identidad lleva un **partner** en vez de un rol de Back Office, ese partner se
> **valida en el login** (deny si es inválido) y su alcance queda **anclado a la
> sesión** por una frontera server-side que trata cualquier cruce como
> `not_found` auditado. El detalle completo (matriz de casos, contratos) está en
> las specs de 007 (§10).

### 2.5 Cómo se "transfiere" la sesión entre webview-login y la transversal (008/009)

**Modelo mental (importante)**: hay **dos clientes OIDC** distintos —
`webview-login` y `backoffice-bff` (transversal)— del **mismo reino**
`backoffice` (mismos protocol mappers `realm_access.roles`/`partner`,
`infra/sso/realm/backoffice-realm.json`). Cada app mantiene su **propia sesión
local** (webview-login la suya en el navegador; la transversal su cookie
`bo_session` sellada y `SameSite=Strict`). **No existe transferencia literal de
sesión**: ningún token del IdP ni cookie de sesión cruza de una app a la otra
(D1 de `research.md` de 008: se **descartó** explícitamente un token de
transferencia firmado y una cookie de dominio padre compartido; `bo_session`
nunca sale del dominio de la transversal).

Lo único **compartido** es la **sesión de identidad del reino** (la cookie del
IdP, en el dominio del IdP). Por eso el "handoff" es, en código, exactamente el
mismo `GET /api/auth/login` → IdP → `GET /api/auth/callback` de §2/§2.1/§2.2:
como el reino ya tiene sesión (creada al loguearse en webview-login), la
transversal re-autentica **sin pedir credenciales** (silent SSO) y sella **su
propia** `bo_session`. Es una **re-autenticación silenciosa**, no un traspaso de
sesión.

**Bifurcación por tipo de usuario (009)** — tras autenticarse en webview-login,
la app lee los claims **solo para decidir qué pantalla mostrar** (la autorización
real sigue server-side en la transversal):

- **Administrador** (rol de Back Office): redirección **inmediata** a
  `GET /api/auth/login?module=admin` → la transversal resuelve a `/admin`. **No**
  pasa por la página de cards (009 reemplaza el "cards para todos" de 008).
- **Asesor** (sin rol admin, con `partnerSlug` resuelto): ve la **página de cards
  modulares** themeada con el branding de su partner (tema vía CORS, ver debajo);
  el clic en **cualquier** card navega a `GET /api/auth/login?module=<id>`, que la
  transversal resuelve al shell `/:partnerSlug` (en esta iteración todas las cards
  van al mismo destino).
- **Asesor sin partner resoluble** (0 o >1 claim): estado de error/sin acceso, no
  se muestran cards ni se crea sesión (falla segura, CT-06/CT-EDGE-1 de 009).

```
webview-login (dominio A)          Transversal (dominio B)           IdP (reino backoffice)
  │  login contra cliente OIDC        │                                   │
  │  "webview-login" ─────────────────┼───────────────────────────────────▶
  │                              usuario autentica (SESIÓN DE REINO creada)
  │  lee claims → decide pantalla (009):                                  │
  │   ├─ admin  ──▶ GET /api/auth/login?module=admin                      │
  │   └─ asesor: página de cards themeada (tema del partner vía CORS)     │
  │              click en card ──▶ GET /api/auth/login?module=<id>        │
  │                                   │  moduleExists(id)? sella moduleId │
  │                                   │  en bo_oidc_tx (o returnTo legacy)│
  │                                   │◀── 302 a authorization_endpoint ──│
  │                                   │───────────────────────────────────▶
  │                                   │   sesión de reino ya existe ⇒ SIN │
  │                                   │   prompt de credenciales (silent SSO)
  │                                   │◀── 302 a /api/auth/callback ──────│
  │                                   │  exchangeAuthorizationCode() (§2.2)
  │                                   │  deriveRoles + derivePartnerRef (007)
  │                                   │  resolveModuleRoute(moduleId,     │
  │                                   │    {roles, hasPartner}) ──▶ route │
  │                                   │    o null ⇒ fallback a /admin     │
  │                                   │  sella SU PROPIA bo_session (nueva)│
  │◀ 302 a route (admin→/admin, asesor→/:partnerSlug) + Set-Cookie bo_session/csrf
  │  (aterriza autenticado en la transversal, sin re-credenciales)        │
```

> **Clave**: el navegador termina con **dos** contextos de sesión —la de reino
> (IdP) y la `bo_session` de la transversal—, ninguna "movida" desde
> webview-login. webview-login nunca reenvía sus tokens a la transversal
> (SC-003 de 008); la transversal deriva partner y roles **server-side** de su
> propio intercambio OIDC.

**Catálogo de módulos (`src/server/security/module-catalog.ts`)** — traduce el
`moduleId` opaco que envía la card de webview-login a una ruta interna real,
**nunca** una ruta propuesta por el cliente (evita open-redirect):

```ts
export function resolveModuleRoute(moduleId, { roles, hasPartner }, catalog = MODULE_CATALOG) {
  const entry = catalog.find((c) => c.moduleId === moduleId);
  if (!entry || !isSafeRoute(entry.route)) return null;
  if (entry.requiredRoles && !entry.requiredRoles.some((r) => roles.includes(r))) return null;
  if (entry.requiresPartner && !hasPartner) return null;
  return entry.route;
}
```

- En `GET /api/auth/login`, solo se valida **existencia** del `moduleId`
  (`moduleExists`) — aún no hay roles/partner (sesión no creada); el `moduleId`
  se sella en `bo_oidc_tx` (`TxPayload.moduleId?`).
- En el callback, con los claims ya derivados, `resolveModuleRoute` decide la
  ruta final; `null` (módulo inexistente, rol sin intersección, o
  `requiresPartner` sin partner) ⇒ fallback a `/admin` (`DEFAULT_RETURN_TO`),
  igual que el `returnTo` legacy inválido.
- El catálogo hoy solo tiene una entrada real (`admin` → `/admin`, roles
  `platform-admin`/`partner-editor`/`auditor`) porque es el único destino
  autenticado que existe en este front; el journey de venta se consume vía API
  (`/api/journey/*`) desde otra app y no tiene página propia en este repo. Añadir
  módulos nuevos es agregar entradas a `MODULE_CATALOG`, sin tocar el router.

**Logout único de reino (RP-initiated)** — `POST /api/auth/logout` ya no solo
expira `bo_session`/`csrf`: también construye la URL del `end_session_endpoint`
del IdP (`buildEndSessionUrl` en `oidc-flow.ts`, envuelve
`client.buildEndSessionUrl` de `openid-client` v6) con
`post_logout_redirect_uri` = `WEBVIEW_LOGIN_URL`, y la devuelve en el cuerpo
(`{ ok: true, endSessionUrl }`) para que el cliente navegue ahí — termina
también la sesión de identidad del reino, evitando que un `GET /api/auth/login`
posterior reestablezca sesión sin credenciales. **Fail-safe**: si el end-session
falla o no está configurado (`WEBVIEW_LOGIN_URL` ausente), las cookies locales
igual quedan expiradas — nunca se deja una sesión operativa viva en la
transversal por un fallo del IdP.

**CORS acotado para el tema (`src/server/security/cors.ts`)** — webview-login
hace un `fetch` de navegador cross-origin a `GET /api/theme/:slug` (y
`GET /api/partners/active`) para themear su página modular con el branding del
partner del asesor (claim `partner` del **propio** token de webview-login, D5 de
008 — la transversal no expone un endpoint "mi partner" nuevo). El middleware
`createCorsMiddleware({ allowedOrigins })` (zero-dependencia, allowlist desde
`WEBVIEW_LOGIN_ORIGIN`) solo se aplica a esas dos rutas públicas: eco exacto del
`Origin` permitido + `Vary: Origin`, preflight `OPTIONS` → `204`, y **sin**
`Access-Control-Allow-Credentials` (el tema es público, no lleva cookies).
Orígenes no listados no reciben cabeceras CORS (el navegador bloquea la lectura,
aunque la respuesta HTTP en sí siga siendo `200`).

**Front (`auth-guard.ts` + `unauthorized-redirect-interceptor.ts`)** — sin
sesión (guard) o con sesión expirada (401 en una acción admin), el front ya no
navega a `/forbidden` ni a `/api/auth/login?returnTo=...` directo: redirige el
navegador (`BrowserRedirect`, solo en plataforma browser) a
`environment.webviewLoginUrl`. `/forbidden` queda reservado exclusivamente para
"autenticado pero sin permiso" (`roleGuard`, sin cambios). En SSR (sin
`window`), el guard conserva el fallback previo (`UrlTree` a `/forbidden`) para
no romper el render del servidor.

---

## 3. Componentes server (BFF)

| Archivo | Responsabilidad | Funciones/tipos clave |
|---|---|---|
| `src/server/oidc/oidc-config.ts` | Carga config OIDC de entorno; discovery del issuer (cacheado). | `loadOidcEnvConfig`, `getOidcConfiguration` (aplica `client.allowInsecureRequests` solo si el issuer no es HTTPS — dev) |
| `src/server/oidc/oidc-flow.ts` | Construye la URL de autorización (PKCE) y valida el intercambio del código. | `buildAuthorizationUrl`, `authorizationCodeGrant` |
| `src/server/security/session-seal.ts` | Sellado/desellado AEAD de la cookie de sesión. | `createSessionSeal`, `sealJson`/`unsealJson`, tipo `SealedSession {sub,name,roles,partnerId?,partnerSlug?,iat,exp}` |
| `src/server/security/role-map.ts` | Deriva roles de aplicación desde los claims del IdP, config-driven. | `deriveRoles(claims, config)`, `loadRoleMapConfigFromEnv`, tipo `AppRole` |
| `src/server/security/partner-claim.ts` (007) | Deriva el partner del asesor desde un claim del IdP (cardinalidad exactamente-uno; ausente/múltiple/inválido ⇒ `null`, menor privilegio). | `derivePartnerRef(claims, config)`, `loadPartnerClaimConfigFromEnv` (`PARTNER_CLAIM_PATH`) |
| `src/server/security/require-partner-scope.ts` (007) | Frontera server-side del journey: exige sesión (401), trata el cruce como `not_found` (404 + auditoría, sin enumeración), re-valida partner activo, adjunta `req.partner` autoritativo. | `requirePartnerScope(deps)`, `partnerScopeFilter(req)` |
| `src/server/api/journey-router.ts` (007) | `POST /journey/:slug/*` — antepone `requirePartnerScope` y orquesta contra el partner de la **sesión** (nunca el `:slug`/body del cliente). Detalle: specs 007. | `createJourneyRouter` |
| `src/server/security/module-catalog.ts` (008) | Catálogo curado `moduleId → ruta` con disponibilidad por rol/partner; nunca una ruta propuesta por el cliente. | `resolveModuleRoute(moduleId, {roles,hasPartner}, catalog?)`, `moduleExists(moduleId)`, tipo `ModuleCatalogEntry` |
| `src/server/security/cors.ts` (008) | CORS zero-dependencia acotado por allowlist de orígenes, para el tema público consumido cross-origin por webview-login. | `createCorsMiddleware({allowedOrigins})` |
| `src/server/oidc/oidc-flow.ts` (008, ampliado) | Además de §2.1/§2.2: construye la URL del `end_session_endpoint` (RP-initiated logout). | `buildEndSessionUrl(config, {postLogoutRedirectUri, idTokenHint?})` |
| `src/server/security/csrf.ts` | Emite y verifica el token CSRF double-submit; middleware de mutaciones. | `issueCsrfToken`, `verifyCsrf`, `requireCsrf()` |
| `src/server/security/require-role.ts` | Autorización por rol sobre un endpoint. | `requireRole(...roles: AppRole[])` |
| `src/server/security/admin-auth-guard.ts` | Puerto `AdminAuthGuard` + adaptador real que desella `bo_session`. | `createSessionAdminAuthGuard({unseal})`, tipo `AdminSession {subject,name,roles}` |
| `src/server/security/cookie-utils.ts` | Parseo/serialización de cookies sin dependencias nuevas. | `parseCookies`, `serializeCookie`, `expireCookie` |
| `src/server/api/auth-router.ts` | Endpoints de login/callback/logout/whoami. | `createAuthRouter` → `GET /auth/login`, `GET /auth/callback`, `GET /admin/session`, `POST /auth/logout` |
| `src/server/api/admin-router.ts` | Aplica la matriz de roles + CSRF a cada endpoint admin. | `requireRole(...)`, `requireCsrf()` compuestos por ruta |
| `src/server/secrets/oidc-secrets.ts` | Resuelve secretos globales del BFF (nunca al cliente). | `resolveOidcSecrets()` → `OIDC_CLIENT_SECRET`, `SESSION_SEAL_KEY` |
| `src/server.ts` | Composition root: arma todas las dependencias, resolución perezosa. | `createAuthRouterDeps()` (memoiza secrets/config para no fallar en build/import) |
| `src/server/persistence/audit.ts` + `sqlite/sqlite-partner-repository.ts` | Auditoría enriquecida, atómica con la mutación; y auditoría append-only de accesos cruzados (007). | `createAuditEntry`, `AuditEntry {actorSub,actorName,diff,themeVersion}`, `appendAccessDenied({actorSub,actorName,attemptedSlug})` |

### 3.1 Esquema SQL de auditoría (`sqlite/schema.ts`)

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL CHECK (entity IN ('partner','partner_theme','access')),
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('create','save_version','update','publish','deactivate','activate','cross_partner_denied')),
  actor_sub  TEXT NOT NULL,
  actor_name TEXT,             -- nullable: filas previas a 006 no lo tienen
  diff       TEXT,             -- JSON Record<field,{from,to}>
  theme_version INTEGER,       -- nullable: solo aplica a create/update/publish de theme
  at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_sub);
CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log(at);
```

> **007**: el `CHECK` incluye `entity:'access'` y `action:'cross_partner_denied'`
> — el vocabulario que necesita `appendAccessDenied` para auditar los accesos
> cruzados entre partners.

`SCHEMA_SQL` usa `CREATE TABLE IF NOT EXISTS`, por lo que una base **nueva** nace
con el `CHECK` vigente. `applySchemaMigrations` cubre las bases **preexistentes**
en dos pasos: (1) `ALTER TABLE ... ADD COLUMN` tolerante para
`actor_name`/`theme_version` (006), y (2) reconstrucción del `CHECK` si es obsoleto
(007):

```ts
export function applySchemaMigrations(db) {
  // 1) Columnas aditivas (006) — tolerante a "duplicate column".
  for (const [column, type] of [['actor_name', 'TEXT'], ['theme_version', 'INTEGER']]) {
    try { db.exec(`ALTER TABLE audit_log ADD COLUMN ${column} ${type};`); }
    catch (err) { if (!/duplicate column/i.test(err.message)) throw err; }
  }
  // 2) CHECK obsoleto (007): rebuild idempotente y auto-correctivo.
  rebuildAuditLogIfStale(db);
}

function rebuildAuditLogIfStale(db) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='audit_log'"
  ).get();
  if (!row || row.sql.includes('cross_partner_denied')) return;   // nueva o ya migrada

  db.exec('PRAGMA foreign_keys=OFF;');
  db.exec('BEGIN;');
  try {
    db.exec(`CREATE TABLE audit_log_new (...CHECK vigente...);`);
    db.exec(`INSERT INTO audit_log_new (...) SELECT ... FROM audit_log;`);  // preserva filas
    db.exec('DROP TABLE audit_log;');
    db.exec('ALTER TABLE audit_log_new RENAME TO audit_log;');
    // recrear idx_audit_entity / idx_audit_actor / idx_audit_at (se van con el DROP)
    db.exec('COMMIT;');
  } catch (err) { db.exec('ROLLBACK;'); throw err; }
  finally { db.exec('PRAGMA foreign_keys=ON;'); }
}
```

**Por qué un rebuild y no un `ALTER`**: SQLite **no permite ALTERar un `CHECK`**
existente. Las bases creadas **antes de 007** tienen el `CHECK` viejo (sin
`access`/`cross_partner_denied`), así que el primer intento de auditar un cruce
—`appendAccessDenied`— **violaba el constraint y devolvía 500** en vez del `404 +
auditoría` esperado. `rebuildAuditLogIfStale` lo repara **al arrancar**: detecta el
`CHECK` obsoleto por introspección de `sqlite_master`, y solo si lo está, rehace la
tabla en una transacción que **preserva todas las filas** e índices (conservando
`save_version` para no perder historial). Es **idempotente** (si el `CHECK` ya está
al día, no hace nada — no requiere `PRAGMA user_version` previo en bases legadas).
La regresión está cubierta en `sqlite-partner-repository.test.ts` (migración de
`CHECK` obsoleto + idempotencia).

Las columnas históricas siguen tolerando `NULL`: el adaptador (`rowToAuditEntry`)
hace *fallback* `actorName ?? actorSub` para no romper la UI de auditoría.

**Atomicidad (FR-009/010)**: `insertAuditEntry` se invoca **dentro** de la
misma transacción SQLite que la mutación, p. ej. en `createPartner`:

```ts
this.db.exec('BEGIN');
try {
  this.db.prepare(`INSERT INTO partners ...`).run(...);
  this.db.prepare(`INSERT INTO partner_themes ...`).run(...);
  this.insertAuditEntry({ entity: 'partner', action: 'create', ... });
  this.db.exec('COMMIT');
} catch (err) {
  this.db.exec('ROLLBACK');   // ni el partner ni la auditoría quedan escritos
  throw err;
}
```

Si cualquier `INSERT`/`UPDATE` de la mutación falla (p. ej. slug duplicado),
el `ROLLBACK` revierte **todo**, incluida la fila de auditoría — nunca hay
una entrada de auditoría "huérfana" de una mutación que en realidad no se
aplicó. Esto es lo que verifica el test `caso 10: atomicidad` y
`P5: mutación revertida` en `sqlite-partner-repository.test.ts`.

**Cálculo del `diff`**: cada acción arma su propio `AuditDiff`
(`Record<campo, {from, to}>`):

- `create` → `{ slug: {from:null,to:...}, displayName: {from:null,to:...} }`.
- `update` (alias de `save_version`, `saveThemeVersion`) → compara, campo a
  campo serializado, la versión anterior (`previousRow`) contra la nueva:
  ```ts
  if (previousRow?.tokens !== JSON.stringify(theme.tokens)) {
    diff['tokens'] = { from: previousRow?.tokens ?? null, to: theme.tokens };
  }
  // ...igual para assets/legal/typography
  ```
  Solo los campos que realmente cambiaron entran al diff.
- `publish`/`activate`/`deactivate` → diffs de estado fijo, p. ej.
  `{ status: { from: 'draft', to: 'published' } }` — no hay comparación de
  contenido porque la mutación en sí *es* un cambio de estado binario.

### 3.2 Resolución perezosa de secretos (`server.ts`)

`createAuthRouterDeps()` (composition root) **no** llama a
`resolveOidcSecrets()`/`loadOidcEnvConfig()` en el nivel superior del módulo
— las difiere con un `memoize` casero:

```ts
function memoize(fn) {
  let cached, computed = false;
  return () => {
    if (!computed) { cached = fn(); computed = true; }
    return cached;
  };
}

function createAuthRouterDeps() {
  const getSecrets = memoize(resolveOidcSecrets);
  const getEnvConfig = memoize(() => loadOidcEnvConfig(process.env, getSecrets().clientSecret));
  const getSessionSeal = memoize(() => createSessionSeal({ key: getSecrets().sessionSealKey }));

  return {
    buildAuthorizationRequest: async (redirectUri) => {
      const config = await getOidcConfiguration(getEnvConfig());   // getEnvConfig() se llama AQUÍ, no antes
      return buildAuthorizationUrl(config, redirectUri);
    },
    // ...
    get txSealKey() { return getSecrets().sessionSealKey; },        // getter, no propiedad plana
    get redirectUri() { return getEnvConfig().redirectUri; },
    // ...
  };
}
```

**Por qué importa**: `src/server.ts` es el mismo módulo que `ng build`
importa para la extracción de rutas SSR (prerendering). Si
`resolveOidcSecrets()` (que **lanza** si falta `OIDC_CLIENT_SECRET`/
`SESSION_SEAL_KEY`) se llamara directamente al construir el objeto de
dependencias, **cualquier build sin esas variables de entorno fallaría** —
incluso en máquinas de CI que no necesitan levantar el servidor real, solo
compilar. Con `memoize`, construir `authRouterDeps` es "gratis" (no evalúa
nada); el error solo aparece si de verdad llega un request que necesita
discovery OIDC o desellar una sesión. `txSealKey`/`redirectUri`/
`postLogoutRedirectUri` se exponen como **getters** (no como propiedades ya
resueltas) precisamente para preservar esa pereza hasta el último momento,
incluso dentro del objeto `AuthRouterDeps` que se pasa a `auth-router.ts`.

Este patrón se descubrió como fix real durante la verificación manual de
esta feature: `ng build` fallaba con `"OIDC_CLIENT_SECRET no configurado"`
antes de introducir el `memoize` (ver §9 Troubleshooting).

---

## 4. Componentes front (Angular)

| Archivo | Responsabilidad |
|---|---|
| `src/app/core/auth/auth-model.ts` | Tipos compartidos `AppRole`, `AuthUser` (incluye `partnerId?`/`partnerSlug?`). |
| `src/app/core/auth/auth.store.ts` | `AuthStore` (NgRx Signals, síncrono): `setUser`, `isAuthenticated`, `hasAnyRole(...roles)`, y (007) `partnerId`/`partnerSlug`/`isAsesor`. |
| `src/app/core/auth/auth-guard.ts` (008) | Exige `isAuthenticated()`; si no, redirige (browser) a `environment.webviewLoginUrl` — no a `/forbidden`. En SSR, fallback a `/forbidden` (sin `window`). |
| `src/app/core/auth/role-guard.ts` | `roleGuard(...roles)` variádico; si no hay match, `/forbidden` (autenticado sin permiso — sin cambios en 008). |
| `src/app/core/auth/session-transfer.ts` (007, bugs 2/4) | Puente SSR→cliente de la sesión vía TransferState: `writeSessionTransferState` (server, pasa por la allowlist) / `readSessionTransferState` (cliente). |
| `src/app/core/tenant/partner-scope-guard.ts` (007) | `partnerScopeMatch` — guard **UX** (`CanMatchFn`): compara el tenant de la ruta con `AuthStore.partnerSlug`; si difieren, redirige al partner propio. **No es la frontera** (el BFF rechaza igual). |
| `src/app/core/store/tenant.store.ts` | `TenantStore` (resolución de tenant de la ruta) — insumo del guard anterior. |
| `src/app/features/auth/services/auth-api.ts` + `queries/auth-queries.ts` | `AuthApiService.getSession()` → `GET /api/admin/session`; `AuthQueries.session()` (TanStack Query). |
| `src/app/core/interceptors/csrf-interceptor.ts` | Añade `X-CSRF-Token` (de la cookie `csrf`) en `POST/PATCH/PUT/DELETE` hacia `/api/admin/*`. |
| `src/app/core/interceptors/unauthorized-redirect-interceptor.ts` + `browser-redirect.ts` (008) | 401 en `/api/admin/*` ⇒ navega a `environment.webviewLoginUrl` (antes: `/api/auth/login?returnTo=...` directo), **excepto** `GET /api/admin/session` (sondeo pasivo del whoami), que no redirige — evita el bucle de redirección (bug 3). |
| `src/app/app.config.ts` | Siembra síncrona de la sesión desde TransferState (007) **antes** de los guards, + whoami (`injectQuery` → `AuthStore.setUser`) como refresco, + registro de interceptores. |
| `src/app/app.config.server.ts` | SSR: desella `bo_session` y siembra `AuthStore` + TransferState antes del render (ver §4.1). |
| `src/app/features/admin/admin.routes.ts` | Aplica `authGuard` + `roleGuard(...)` al layout admin. |

### 4.1 Siembra de sesión en SSR + `AuthStore` síncrono (`app.config.server.ts` / `app.config.ts`)

`AuthStore` (NgRx Signals) es **estado síncrono de UI** que leen los guards; la
clave está en **cuándo** se puebla. Desde los bugfixes 2/4, la sesión se resuelve
**en el render server** y se pasa al cliente, de modo que los guards la ven ya en
la primera navegación (no solo tras un round-trip cliente).

**SSR — `app.config.server.ts`** (mismo `provideAppInitializer` que resuelve el
theme): tras inyectar `REQUEST` (síncrono, antes de cualquier `await`), desella la
cookie de sesión y siembra store + TransferState:

```ts
const sealKey = process.env['SESSION_SEAL_KEY'];
const cookieHeader = request.headers.get('cookie') ?? undefined;
if (sealKey && cookieHeader) {
  const raw = parseCookies(cookieHeader)['bo_session'];
  const sealed = raw ? createSessionSeal({ key: sealKey }).unseal(raw) : null;
  if (sealed) {
    const user = { subject: sealed.sub, name: sealed.name, roles: sealed.roles,
                   ...(sealed.partnerId  ? { partnerId:  sealed.partnerId }  : {}),
                   ...(sealed.partnerSlug ? { partnerSlug: sealed.partnerSlug } : {}) };
    authStore.setUser(user);                       // guards SSR ven la sesión
    writeSessionTransferState(transferState, user); // cruza al cliente (allowlist)
  }
}
// Falla segura: cualquier error ⇒ anónimo (comportamiento previo).
```

`writeSessionTransferState` pasa por `assertAllowedTransferStateWrite`, que solo
deja cruzar la forma exacta de `AuthUser` (nunca el token del IdP ni un secreto —
misma allowlist que el theme, FR-022).

**Cliente — `app.config.ts`**: un `provideAppInitializer` **síncrono** siembra el
store desde TransferState **antes** de la primera navegación/guards; el whoami
queda como **refresco/fallback**:

```ts
// (1) siembra síncrona desde TransferState — corre ANTES de los guards
provideAppInitializer(() => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const user = readSessionTransferState(inject(TransferState));
  if (user) inject(AuthStore).setUser(user);
});
// (2) whoami (TanStack Query) — refresco/fallback; su 401 ya NO redirige (bug 3)
provideAppInitializer(() => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const session = injectQuery(() => inject(AuthQueries).session());
  effect(() => { /* setUser(data) | clear() on error */ });
});
```

**Por qué importa**: `authGuard`/`roleGuard`/`partnerScopeMatch` son
`CanActivate`/`CanMatch` que resuelven de forma **inmediata** (leen signals
síncronos). Al sembrar el store en SSR y en el `appInitializer` cliente **antes**
de que corra el router, los guards ven la sesión ya en la carga completa e
hidratación:

- **Bug 4** (resuelto): antes, en navegación completa a `/admin` (incluido el
  redirect del callback OIDC), el store estaba vacío durante SSR y el guard caía a
  `/forbidden` pese a haber sesión válida. Ahora `/admin` renderiza.
- **Bug 2** (resuelto): el guard UX `partnerScopeMatch` ahora **sí** redirige al
  partner propio en un hard-reload de la ruta de otro partner (antes solo actuaba
  tras la hidratación cliente).

Se mantiene la separación de la Constitución (§I, `ARCHITECTURE.md`): **TanStack
Query** es la fuente de verdad de datos de servidor asíncronos; **NgRx Signals
(`AuthStore`)** es estado síncrono de UI. El whoami sigue existiendo como refresco
(p. ej. si la sesión de TransferState expira), y su `401` **ya no dispara login**
(exclusión del interceptor — bug 3), evitando el bucle `/forbidden`⇄`/api/auth/login`.

---

## 5. Modelo de roles (PRD 06 §3)

| Rol | Lectura (`GET partners/audit`) | Mutación (`POST/PATCH`) | Theme default / admins |
|---|:--:|:--:|:--:|
| `platform-admin` | ✅ | ✅ | ✅ |
| `partner-editor` | ✅ | ✅ | ❌ (403) |
| `auditor` | ✅ | ❌ (403) | ❌ (403) |
| *(sin rol mapeable)* | ❌ (403) | ❌ (403) | ❌ (403) |

Matriz de endpoints (`admin-authz.contract.md` §2):

| Endpoint | Método | Roles permitidos |
|---|---|---|
| `/partners`, `/partners/:id` | GET | los 3 roles |
| `/audit` | GET | `platform-admin`, `auditor` |
| `/partners`, `/partners/:id`, `/publish`, `/activate`, `/deactivate`, `/assets` | POST/PATCH | `platform-admin`, `partner-editor` |

Orden de middlewares: `requireAdminSession (401) → requireCsrf en mutaciones (403) → requireRole(...) (403) → handler`.

### 5.1 Orden de middlewares y por qué importa

Composición real en `admin-router.ts` (idéntica para cada endpoint de
mutación):

```ts
router.post('/partners', requireCsrf(), requireRole(...MUTATION_ROLES), async (req, res, next) => {
  // handler...
});
```

y antes de todo, montado a nivel de router (`router.use(...)`):

```ts
router.use(async (req, res, next) => {
  if (await requireAdminSession(deps.adminAuthGuard, req, res)) next();
});
```

`requireAdminSession` llama a `guard.authorize({ headers: req.headers })`.
El adaptador real (`createSessionAdminAuthGuard`, en `admin-auth-guard.ts`)
hace exactamente esto:

```ts
async authorize(req) {
  const cookieHeader = req.headers['cookie'];
  const raw = parseCookies(cookieHeader)['bo_session'];
  const session = raw ? deps.unseal(raw) : null;
  if (!session) throw new Error('unauthorized: sesión ausente, expirada o inválida');
  return {
    subject: session.sub, name: session.name, roles: session.roles,
    ...(session.partnerId  !== undefined ? { partnerId:  session.partnerId }  : {}),  // 007
    ...(session.partnerSlug !== undefined ? { partnerSlug: session.partnerSlug } : {}),
  };
}
```

Si `authorize` lanza, `requireAdminSession` responde `401` y **corta la
cadena** — ni CSRF ni rol se evalúan sin sesión.

**¿Por qué CSRF se verifica *antes* que el rol?** Dos razones:

1. **Contractual** (`admin-authz.contract.md` §4): el orden está fijado
   explícitamente como `requireAdminSession → requireCsrf → requireRole`.
2. **Defensa en profundidad sin acoplar la lógica**: si `requireRole` se
   evaluara primero, el código de error (403 por rol vs 403 por CSRF)
   dependería del rol del atacante, filtrando información sobre si su sesión
   robada tiene o no el rol correcto antes de que el CSRF importe. Verificar
   CSRF primero mantiene una única razón de fallo consistente para toda
   sesión sin CSRF válido, sin importar su rol.

---

## 6. Cookies

| Cookie | Flags | Vida | Contenido |
|---|---|---|---|
| `bo_session` | `HttpOnly; Secure*; SameSite=Strict` | `SESSION_TTL_SECONDS` (default 1h) | Sellado AEAD: `{sub,name,roles,partnerId?,partnerSlug?,iat,exp}`. `partnerId/partnerSlug` presentes ⟺ sesión de asesor (007). Nunca el token del IdP. |
| `csrf` | `SameSite=Strict` (legible por JS a propósito) | igual que `bo_session` | Valor aleatorio (`randomBytes(32)`), comparado contra `X-CSRF-Token`. |
| `bo_oidc_tx` | `HttpOnly; SameSite=Lax` | 10 minutos | Sellado: `{codeVerifier,state,nonce,returnTo}` — solo durante el intercambio con el IdP. |

\* `Secure` se activa cuando `NODE_ENV=production` (ver `src/server.ts`,
`secureCookies`). En dev sobre HTTP se omite intencionalmente.

### 6.1 Anatomía de la cookie `bo_session` (`session-seal.ts`)

El valor de la cookie no es un JWT (no es legible por el cliente ni parcial
ni totalmente) — es un blob AEAD:

```ts
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export function sealJson(payload, key) {
  const keyBuffer = Buffer.from(key, 'base64');
  const iv = randomBytes(IV_LENGTH);                    // 12 bytes, aleatorio POR sellado
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();                  // 16 bytes
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}
```

Formato final: **`base64url( iv[12] ‖ authTag[16] ‖ ciphertext )`**.

- **Por qué AEAD (AES-256-GCM) y no solo cifrado**: GCM da *confidencialidad*
  (el cliente no puede leer `roles`/`sub`) **y** *integridad* en una sola
  primitiva — el `authTag` es un MAC sobre el ciphertext; si se altera un
  solo bit del blob, `decipher.setAuthTag(authTag)` + `decipher.final()`
  lanza, y `unsealJson` lo captura y devuelve `null`. Esto es lo que impide
  el ataque "modifico mi cookie para ponerme `platform-admin`" (edge case
  explícito de la spec).
- **Por qué el IV es aleatorio en cada `seal()`**: en AES-GCM, reusar el
  mismo `(key, iv)` para cifrar dos payloads distintos rompe la
  confidencialidad y la integridad del esquema (permite recuperar el
  keystream por XOR de ambos ciphertexts). Como la key (`SESSION_SEAL_KEY`)
  es fija por proceso, el IV *tiene* que cambiar en cada sellado — de ahí
  `randomBytes(IV_LENGTH)` en cada llamada, nunca derivado de forma
  determinística.
- **`unseal` nunca lanza** — captura cualquier excepción (JSON inválido, tag
  inválido, buffer corto) y devuelve `null`; y además revisa `exp`
  explícitamente:
  ```ts
  unseal(raw) {
    const session = unsealJson(raw, deps.key);
    if (!session || session.exp * 1000 <= now()) return null;
    return session;
  }
  ```
  Esto simplifica al llamador (`createSessionAdminAuthGuard`): "sesión
  ausente", "sesión corrupta" y "sesión expirada" son **el mismo caso** desde
  el punto de vista del guard — todos terminan en 401, sin distinguir el
  motivo al cliente (no filtra si la cookie era inválida vs. si expiró).
- **`bo_oidc_tx`** usa el mismo mecanismo (`sealJson`/`unsealJson`) pero con
  un payload distinto (`{codeVerifier, state, nonce, returnTo}`) — se reusa
  la primitiva genérica en vez de duplicar lógica AEAD.

### 6.2 CSRF double-submit — por qué es seguro sin estado (`csrf.ts`)

```ts
export function issueCsrfToken() {
  return randomBytes(32).toString('base64url');   // NO sellado — valor plano aleatorio
}

export function verifyCsrf(cookieValue, headerValue) {
  if (!cookieValue || !headerValue) return false;
  const a = Buffer.from(cookieValue, 'utf-8');
  const b = Buffer.from(headerValue, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

A diferencia de `bo_session`, el token `csrf` **no se sella** — es
intencional: no es un secreto de confidencialidad, es un secreto de
*same-origin*.

**Modelo de amenaza**: un sitio atacante (`evil.com`) puede lograr que el
navegador de la víctima envíe una request a nuestro dominio con sus cookies
adjuntas (eso es justamente lo que `SameSite=Strict` ya dificulta, pero no
100% en todos los casos/navegadores/versiones — de ahí la defensa en
profundidad). Lo que `evil.com` **no puede hacer** es *leer* el valor de la
cookie `csrf` de la víctima (la same-origin policy del navegador se lo
impide) ni por tanto ponerlo en el header `X-CSRF-Token` de su request
falsificada. Por eso comparar "cookie vs header" sin necesidad de estado en
el servidor es suficiente: solo un script ejecutándose en nuestro propio
origen (nuestro front, vía el interceptor) puede leer la cookie y replicar
su valor en el header.

`timingSafeEqual` evita que la comparación de bytes filtre, por el tiempo de
respuesta, cuántos caracteres del token coinciden (ataque de timing) — una
comparación ingenua (`a === b`) de JS de cadenas puede cortocircuitar en el
primer byte distinto.

---

## 7. Variables de entorno

Ver `.env.example` (raíz) e `infra/sso/README.md` para el detalle completo y
la paridad dev/prod.

| Variable | Uso |
|---|---|
| `OIDC_ISSUER_URL` | Issuer del IdP (RH-SSO 7.6 sirve bajo `/auth`, p. ej. `http://localhost:8080/auth/realms/backoffice`). |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | Cliente confidencial OIDC. |
| `OIDC_REDIRECT_URI` | Callback OIDC. |
| `SESSION_SEAL_KEY` | 32 bytes base64 — clave AEAD de la sesión. |
| `SESSION_TTL_SECONDS` | Vida de `bo_session`. |
| `ROLE_CLAIM_PATH` / `ROLE_MAP` | Mapeo claim del IdP → `AppRole` (JSON). |
| `PARTNER_CLAIM_PATH` (007) | Ruta (notación de puntos) del claim de partner en el token, p. ej. `partner`. Default: `partner`. Deriva `partnerId/partnerSlug` de la sesión del asesor. |
| `WEBVIEW_LOGIN_ORIGIN` (008) | Origen(es) permitido(s) —coma-separado— para el CORS de `GET /api/theme/:slug` y `GET /api/partners/active` (allowlist consumida por webview-login). |
| `WEBVIEW_LOGIN_URL` (008) | URL base de webview-login: `post_logout_redirect_uri` del logout de reino (`POST /api/auth/logout`) y destino de redirección del front cuando no hay sesión (`auth-guard.ts`, `unauthorized-redirect-interceptor.ts`). Reemplaza a `OIDC_POST_LOGOUT_REDIRECT_URI` (007 y antes). |

---

## 8. Escenarios de prueba manual

### Preparación

```bash
# 1. Levantar el IdP (misma imagen que prod, D11)
podman-compose -f infra/sso/podman-compose.yml up -d
bash infra/sso/import-realm.sh   # importa el realm backoffice (4 usuarios)

# 2. Exportar las variables de entorno del BFF (ver .env.example)
export OIDC_ISSUER_URL="http://localhost:8080/auth/realms/backoffice"
export OIDC_CLIENT_ID="backoffice-bff"
export OIDC_CLIENT_SECRET="backoffice-bff-dev-secret"
export OIDC_REDIRECT_URI="http://localhost:4000/api/auth/callback"
export SESSION_SEAL_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
export SESSION_TTL_SECONDS="3600"
export ROLE_CLAIM_PATH="realm_access.roles"
export ROLE_MAP='{"platform-admin":"platform-admin","partner-editor":"partner-editor","auditor":"auditor"}'
export PARTNER_CLAIM_PATH="partner"   # 007
export WEBVIEW_LOGIN_ORIGIN="http://localhost:4300"   # 008
export WEBVIEW_LOGIN_URL="http://localhost:4300"      # 008
export PORT=4000

# 3. Build + arrancar el BFF
npx ng build
node dist/transversal/server/server.mjs
```

Usuarios de prueba (`infra/sso/README.md`):

- **Back Office (006)**: `admin-user`/`editor-user`/`auditor-user`/`norole-user`,
  password = mismo nombre de usuario.
- **Asesores (007)**: `asesor-a` (claim `partner=banco-a`), `asesor-b`
  (`partner=banco-b`) y `asesor-inactivo` (partner inexistente/inactivo, prueba de
  deny). Los escenarios de acceso legítimo y de **cruce A→B** (404 + auditoría, sin
  fuga) están en el quickstart de 007 (§10), no se duplican aquí.

### Escenario 1 — Login SSO happy path (SC-001, SC-002)

> **Entrada real (008/009)**: en producción el usuario **no** teclea la URL de la
> transversal — inicia en `webview-login` y desde ahí llega con silent SSO (§2.5).
> El escenario de abajo ejercita **la pierna OIDC de la transversal en
> aislamiento** (útil para verificar el sellado de sesión sin levantar
> webview-login): al no haber sesión de reino previa, aquí el IdP **sí** pide
> credenciales; con webview-login ya autenticado, ese prompt no aparecería.

**En navegador**: ir a `http://localhost:4000/admin` sin sesión ⇒ el `authGuard`
del front redirige a `webviewLoginUrl` (008); para probar directo la pierna de la
transversal, ir a `http://localhost:4000/api/auth/login` ⇒ redirección al IdP ⇒
autenticarse como `editor-user` ⇒ vuelve a `/admin` autenticado. Abrir DevTools →
Application → Cookies: debe verse **solo** `bo_session` (httpOnly) y `csrf`.
**Nunca** debe aparecer un access/ID token.

**Por curl** (con cookie-jar, para automatizar):

```bash
jar=$(mktemp)
login_headers=$(curl -sD - -o /dev/null -c "$jar" http://localhost:4000/api/auth/login)
auth_url=$(echo "$login_headers" | grep -i '^location:' | sed 's/location: //I' | tr -d '\r')
form_html=$(curl -s -c "$jar" -b "$jar" "$auth_url")
action=$(echo "$form_html" | grep -o 'action="[^"]*"' | head -1 | sed 's/action="//;s/"$//' | sed 's/\&amp;/\&/g')
curl -sD - -o /dev/null -c "$jar" -b "$jar" \
  --data-urlencode "username=editor-user" --data-urlencode "password=editor-user" "$action" \
  | grep -i '^location:'
# seguir el location devuelto (Keycloak → BFF callback) y luego:
curl -s -b "$jar" http://localhost:4000/api/admin/session
# Esperado: {"subject":"...","name":"Editor User","roles":["partner-editor"]}
```

### Escenario 2 — Sesión expirada/inválida (SC-004)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/admin/session
# Esperado: 401 (sin cookie bo_session)
curl -s -b "bo_session=valor-invalido" -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/admin/session
# Esperado: 401 (desellado falla)
```

En el navegador, un 401 en `/api/admin/*` dispara la navegación a
`environment.webviewLoginUrl` (008, interceptor `unauthorized-redirect-interceptor`,
ver §2.5), **excepto** el sondeo pasivo `GET /api/admin/session` (whoami), cuyo
401 se ignora para no entrar en bucle de redirección (bug 3).

### Escenario 3 — Menor privilegio, `norole-user` (US2 esc.4)

Repetir el login del Escenario 1 con `norole-user`/`norole-user`, luego:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b "$jar" http://localhost:4000/api/admin/partners
curl -s -o /dev/null -w "%{http_code}\n" -b "$jar" http://localhost:4000/api/admin/audit
# Esperado: 403 en ambos — roles: [] (sin rol mapeable)
```

### Escenario 4 — RBAC por rol (SC-003)

Login como `auditor-user`:

```bash
curl -s -o /dev/null -w "GET partners: %{http_code}\n" -b "$jar" http://localhost:4000/api/admin/partners
# Esperado: 200
csrf=$(grep -oP 'csrf\s+\K\S+' "$jar" | tail -1)
curl -s -o /dev/null -w "POST partners: %{http_code}\n" -b "$jar" -H "X-CSRF-Token: $csrf" \
  -H "Content-Type: application/json" -d '{"slug":"x","displayName":"X"}' \
  http://localhost:4000/api/admin/partners
# Esperado: 403 (auditor no puede mutar) — sin efecto en la base de datos
```

Repetir con `editor-user` o `admin-user`: el mismo POST debe dar `201`.

### Escenario 5 — CSRF (FR-013)

Con sesión válida de `editor-user` pero **sin** header `X-CSRF-Token`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b "$jar" -H "Content-Type: application/json" \
  -d '{"slug":"y","displayName":"Y"}' http://localhost:4000/api/admin/partners
# Esperado: 403 (aunque la sesión sea válida)
```

### Escenario 6 — Auditoría enriquecida (SC-005)

Tras cualquier mutación exitosa (p. ej. el `POST /partners` del Escenario 4
con `editor-user`):

```bash
curl -s -b "$jar" "http://localhost:4000/api/admin/audit?limit=1"
```

Esperado: una entrada con `actorSub` (el `sub` técnico), **`actorName`**
(`"Editor User"`, el nombre legible), `action:"create"`, `diff` con los
campos creados, y `at` (ISO-8601). Para `publish`, además debe traer
`themeVersion`.

### Escenario 7 — Filtros de auditoría (SC-007, SC-008)

```bash
curl -s -b "$jar" "http://localhost:4000/api/admin/audit?partnerId=<id>&actor=<sub>&from=2026-01-01&to=2026-12-31"
```

Los filtros combinan con AND. Para reconstruir "la marca vigente en fecha X":
filtrar `entityId=<partnerId>&action=publish&to=<X>` y tomar el primer
resultado (orden `at DESC`) — su `themeVersion` es la versión vigente en esa
fecha.

---

## 9. Troubleshooting

- **`OAUTH_HTTP_REQUEST_FORBIDDEN` / "only requests to HTTPS are allowed"**:
  `openid-client` v6 bloquea por defecto discovery/requests a issuers no-HTTPS.
  En dev (`http://localhost:8080`) esto se resuelve en
  `src/server/oidc/oidc-config.ts` aplicando `client.allowInsecureRequests`
  **solo** cuando `issuerUrl` no empieza con `https:`. Si este error reaparece,
  confirmar que esa condición sigue presente.
- **404 en discovery**: RH-SSO 7.6 (Keycloak 15.x) sirve bajo `/auth`
  (`.../auth/realms/<realm>`), a diferencia de Keycloak ≥17. Revisar que
  `OIDC_ISSUER_URL` incluya `/auth`.
- **`ng build` falla con "OIDC_CLIENT_SECRET no configurado"**: la
  construcción de dependencias en `server.ts` es perezosa (`createAuthRouterDeps`
  memoiza `resolveOidcSecrets`) precisamente para que la extracción de rutas
  de `ng build` no requiera el `.env`. Si el error reaparece, algo volvió a
  resolver secretos de forma eager al importar el módulo (ver §3.2).
- **Inspeccionar el contenido desellado de `bo_session` (debugging local)**:
  la cookie no es legible a simple vista (es un blob AEAD, §6.1). Para ver
  qué contiene realmente sin modificar código, usar un script Node puntual
  con la misma `SESSION_SEAL_KEY` del entorno:
  ```bash
  node --experimental-strip-types -e "
  import('./src/server/security/session-seal.ts').then(({ createSessionSeal }) => {
    const seal = createSessionSeal({ key: process.env.SESSION_SEAL_KEY });
    console.log(seal.unseal(process.argv[1]));
  });
  " "<valor-de-la-cookie-bo_session>"
  ```
  Si imprime `null`, la cookie está expirada, corrupta, o la key no coincide
  con la que la selló (p. ej. reiniciaste el BFF con otra `SESSION_SEAL_KEY`
  y las sesiones viejas quedan inválidas — esperado, no es un bug).
- **500 en `/api/auth/callback` vs. 302 a `/forbidden`**: son dos cosas
  distintas. Un **302 a `/forbidden`** es el camino esperado y manejado
  cuando `exchangeAuthorizationCode` lanza por una validación OIDC fallida
  (state/nonce/firma/exp inválidos, o el IdP no responde) — es la "falla
  segura" documentada en el contrato (FR-003, edge "IdP no disponible"): el
  `catch` en `auth-router.ts` lo captura explícitamente y limpia
  `bo_oidc_tx` sin emitir sesión. Un **500** significa una excepción **no
  capturada** en otro punto del pipeline (p. ej. `SESSION_SEAL_KEY` ausente,
  `ROLE_MAP` con JSON malformado) — ahí sí hay que revisar los logs del BFF
  (`logRequestError`, `src/server/observability/request-log.ts`) para
  encontrar la causa raíz.
- **500 en el primer cruce de partner sobre una base pre-007** (007): si al
  hacer `POST /api/journey/:otro-slug/*` la auditoría del cruce devuelve **500**
  en vez de `404`, la base tiene el `CHECK` **obsoleto** de `audit_log` (sin
  `access`/`cross_partner_denied`). Se **repara solo al arrancar** el BFF
  (`rebuildAuditLogIfStale`, §3.1). Si reaparece, confirmar que
  `applySchemaMigrations` sigue llamando al rebuild y que la base se abrió con esa
  ruta de migración (constructor de `SqlitePartnerRepository`).
- **Bucle `/forbidden` ⇄ `/api/auth/login` (o `429 rate_limited`)**: lo causa que
  el `401` del sondeo pasivo `GET /api/admin/session` (whoami) dispare la
  redirección a login en cada carga anónima. El interceptor
  (`unauthorized-redirect-interceptor.ts`) **excluye** ese endpoint precisamente
  para evitarlo (bug 3). Si el bucle reaparece, revisar que la condición sigue
  descartando `…/admin/session` (`req.url.endsWith('/admin/session')`).

---

## 10. Referencias de diseño

Para el detalle completo de decisiones (D1–D12), modelo de datos y contratos:

- [`specs/006-authz-roles-auditoria/spec.md`](../specs/006-authz-roles-auditoria/spec.md)
- [`specs/006-authz-roles-auditoria/research.md`](../specs/006-authz-roles-auditoria/research.md)
- [`specs/006-authz-roles-auditoria/data-model.md`](../specs/006-authz-roles-auditoria/data-model.md)
- [`specs/006-authz-roles-auditoria/contracts/`](../specs/006-authz-roles-auditoria/contracts/) (`auth-api`, `admin-authz`, `audit-api`, `front-authz`, `dev-idp-infra`)
- [`specs/006-authz-roles-auditoria/quickstart.md`](../specs/006-authz-roles-auditoria/quickstart.md)

Feature **007 — Aislamiento de Asesor por Partner** (frontera del journey, claim
de partner, guard de front):

- [`specs/007-aislamiento-asesor-partner/spec.md`](../specs/007-aislamiento-asesor-partner/spec.md)
- [`specs/007-aislamiento-asesor-partner/research.md`](../specs/007-aislamiento-asesor-partner/research.md) (D1–D8)
- [`specs/007-aislamiento-asesor-partner/data-model.md`](../specs/007-aislamiento-asesor-partner/data-model.md)
- [`specs/007-aislamiento-asesor-partner/contracts/`](../specs/007-aislamiento-asesor-partner/contracts/) (`partner-claim`, `journey-authz`, `front-partner-scope`)
- [`specs/007-aislamiento-asesor-partner/quickstart.md`](../specs/007-aislamiento-asesor-partner/quickstart.md) — escenarios E2E de acceso legítimo y cruce

Feature **008 — Login Externo (webview-login) y Transferencia de Sesión SSO**
(entrada única en otro dominio, catálogo de módulos, CORS del tema, logout de
reino):

- [`specs/008-login-externo-transferencia-sesion/spec.md`](../specs/008-login-externo-transferencia-sesion/spec.md)
- [`specs/008-login-externo-transferencia-sesion/research.md`](../specs/008-login-externo-transferencia-sesion/research.md) (D1–D6)
- [`specs/008-login-externo-transferencia-sesion/data-model.md`](../specs/008-login-externo-transferencia-sesion/data-model.md)
- [`specs/008-login-externo-transferencia-sesion/contracts/`](../specs/008-login-externo-transferencia-sesion/contracts/) (`auth-login-module`, `realm-second-client`, `theme-cors`, `webview-login-consumption`)
- [`specs/008-login-externo-transferencia-sesion/quickstart.md`](../specs/008-login-externo-transferencia-sesion/quickstart.md) — escenarios E2E del handoff, tema, navegación por card, logout y fail-secure

Feature **009 — Experiencia de Usuario de Login Externo (webview-login)**
(bifurcación admin/asesor: el admin va directo a `/admin` sin cards, el asesor ve
las cards themeadas; UX de la app `webview-login`, repo hermano):

- [`specs/009-webview-login-experiencia-usuario/spec.md`](../specs/009-webview-login-experiencia-usuario/spec.md)
- [`specs/009-webview-login-experiencia-usuario/plan.md`](../specs/009-webview-login-experiencia-usuario/plan.md)
- [`specs/009-webview-login-experiencia-usuario/research.md`](../specs/009-webview-login-experiencia-usuario/research.md) (R1–R4)
- [`specs/009-webview-login-experiencia-usuario/data-model.md`](../specs/009-webview-login-experiencia-usuario/data-model.md)
- [`specs/009-webview-login-experiencia-usuario/contracts/`](../specs/009-webview-login-experiencia-usuario/contracts/) (`webview-login-routing`)
- [`specs/009-webview-login-experiencia-usuario/quickstart.md`](../specs/009-webview-login-experiencia-usuario/quickstart.md)

- [`infra/sso/README.md`](../infra/sso/README.md) — infra del IdP de desarrollo
