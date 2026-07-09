# Research: Experiencia de Usuario de Login Externo (webview-login)

## Contexto de research

`webview-login` es un scaffold Angular 20 en blanco (SPA puro, sin SSR/Express,
a diferencia de `transversal`). El contrato técnico de comunicación con
`transversal` (segundo cliente OIDC, `GET /api/theme/:slug` con CORS,
`GET /api/auth/login?module=`, logout de reino) ya está congelado en
`specs/008-login-externo-transferencia-sesion/`. Las decisiones de este
research se limitan a **cómo implementa `webview-login`, del lado del
navegador, su propia mitad del flujo OIDC** (algo que 008 no cubre porque
008 describe el lado servidor de transversal) y a la estructura interna del
proyecto.

## R1 — Cómo realiza `webview-login` su propio login OIDC (Code+PKCE) sin backend propio

- **Decision**: `webview-login` implementa Authorization Code + PKCE
  **enteramente en el navegador**, como cliente público (sin client secret)
  del segundo cliente SSO `webview-login` ya provisionado en
  `infra/sso/realm/backoffice-realm.json` (ver 008/`realm-second-client`).
  Se construye con primitivas nativas de plataforma — `crypto.subtle` para
  `code_verifier`/`code_challenge` (S256) y `HttpClient` para el intercambio
  del `code` en el `token_endpoint` — sin añadir una librería OIDC de
  terceros (`oidc-client-ts`, `angular-oauth2-oidc`, etc.).
- **Rationale**: mantiene la superficie de dependencias mínima (coherente con
  el resto del ecosistema, que evita dependencias nuevas cuando el flujo es
  acotado), y el flujo público SPA de Code+PKCE es un patrón estándar y bien
  documentado que no requiere las funciones avanzadas (refresh silencioso
  poco usado aquí, gestión multi-proveedor) que justificarían una librería.
  El id_token resultante solo se usa para leer claims (rol, partner) del lado
  del cliente para decidir **qué pantalla mostrar** — la autorización real
  (validación de partner activo, resolución de módulo) ya ocurre
  server-side en `transversal` (specs 006/007/008), así que no hace falta
  verificar la firma del token en el navegador.
- **Alternatives considered**: (a) añadir `oidc-client-ts` — descartado por
  ser una dependencia pesada para un flujo de un único proveedor y sin
  necesidad de silent-renew en iframe; (b) mover el intercambio de código a
  un endpoint propio server-side de `webview-login` — descartado porque
  implicaría añadir SSR/Express al proyecto solo para esto, cuando el patrón
  público-SPA-PKCE ya es seguro sin backend (no hay client secret que
  proteger).

## R2 — Dónde vive el estado de sesión de `webview-login` mientras decide la bifurcación

- **Decision**: el `id_token`/claims decodificados se guardan únicamente en
  memoria (un signal en un store de sesión, nunca `localStorage`/
  `sessionStorage`/cookies) durante el tiempo mínimo entre el callback OIDC y
  la redirección de página completa (`window.location.href`) hacia
  `transversal`. Tras esa redirección, `webview-login` se descarta (nueva
  navegación de documento) — no hay estado persistente que mantener.
- **Rationale**: cumple FR-010 (no exponer tokens más allá de lo necesario);
  al no persistir tokens, un XSS o una pestaña abierta no deja artefactos de
  sesión reutilizables. El `code_verifier` transitorio (entre el redirect de
  ida a la IdP y el callback) si necesita sobrevivir una recarga de página se
  guarda en `sessionStorage` (estándar en PKCE-SPA, se borra al usarse) — es
  el único dato persistido, y no es sensible por sí mismo.
- **Alternatives considered**: usar `bo_session`-style cookie compartida —
  descartado porque `webview-login` está en otro dominio y compartir esa
  cookie violaría el aislamiento de dominios ya decidido en 008 (sesión de
  transversal jamás cruza dominios).

## R3 — Cómo se determina "administrador" vs "asesor" en el cliente

- **Decision**: se reutiliza el mismo claim de roles (`realm_access.roles`) y
  el mismo claim de partner ya mapeados por el realm para el cliente
  `backoffice-bff` (ver 008 `data-model.md`), aplicados igual al nuevo
  cliente `webview-login` (mismos protocol mappers, confirmado en
  `realm-second-client.contract.md`). Un usuario es "administrador" si su
  conjunto de roles intersecta `{platform-admin, partner-editor, auditor}`
  (el mismo conjunto que ya usa `resolveModuleRoute` en
  `module-catalog.ts`); en caso contrario, y si tiene un claim de partner
  resoluble a exactamente un partner, es "asesor".
- **Rationale**: evita introducir una segunda fuente de verdad para roles;
  el cliente solo necesita esta clasificación para decidir qué pantalla
  renderiza, no para autorizar nada (la autorización real ya la hace
  transversal en el callback server-side).
- **Alternatives considered**: pedir a transversal un endpoint nuevo de
  "quién soy antes de loguear" — descartado explícitamente por 008
  (`webview-login-consumption.contract.md`): transversal no expone un
  endpoint de identidad previo al login; el rol se deriva del propio token
  del cliente.

## R4 — Estructura interna del proyecto `webview-login`

- **Decision**: se adopta la misma convención feature-first descrita en
  `transversal/.claude/ARCHITECTURE.md` §1–§4 (guards funcionales, rutas
  lazy vía `loadChildren`/`loadComponent`, NgRx Signals solo para estado
  síncrono de sesión, Tailwind v4, zoneless, `inject()`), ya que
  `webview-login` fue scaffolded con exactamente el mismo stack
  (`@ngrx/signals`, `@tanstack/angular-query-experimental`, Tailwind v4,
  `provideZonelessChangeDetection`) — ver Assumptions.
- **Rationale**: consistencia entre los dos frontends del mismo dominio de
  producto, y reutilización directa de los patrones ya validados en
  `transversal` (guards en capas, layouts por feature) sin tener que
  redescubrirlos.
- **Alternatives considered**: estructura ad-hoc más simple dado que es un
  proyecto pequeño — descartada porque el proyecto ya trae el mismo stack de
  dependencias, sugiriendo que se espera la misma disciplina arquitectónica.

## Resumen de Technical Context resuelto

| Aspecto | Resolución |
|---|---|
| Language/Version | TypeScript / Angular 20.3 (igual que transversal) |
| Primary Dependencies | `@angular/*` 20.3, `@ngrx/signals`, `@tanstack/angular-query-experimental`, Tailwind v4 — sin librería OIDC nueva (R1) |
| Storage | N/A (sin persistencia salvo `sessionStorage` transitorio del `code_verifier`, R2) |
| Testing | Karma/Jasmine (`ng test`, ya configurado en el scaffold) |
| Target Platform | Navegador (SPA), servido está-tico/CDN — sin SSR |
| Project Type | Web application (frontend-only, consume APIs de `transversal`) |
| Performance Goals | Cards themeadas visibles en <3s tras autenticación (SC-003) |
| Constraints | Sin backend propio; tokens nunca persistidos fuera de memoria/`sessionStorage` transitorio (FR-010) |
| Scale/Scope | Un puñado de rutas (`/login` implícito en `''`, `/callback`, `/cards`), sin roles adicionales fuera de admin/asesor |
