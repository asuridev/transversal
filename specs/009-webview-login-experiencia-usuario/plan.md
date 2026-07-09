# Implementation Plan: Experiencia de Usuario de Login Externo (webview-login)

**Branch**: `master` (sin branch de feature dedicado; no hay hook `before_specify`/`before_plan` de creación de rama configurado en este repo) | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-webview-login-experiencia-usuario/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

`webview-login` (hoy un scaffold Angular 20 vacío, sin auth ni rutas) debe
implementar: (1) redirigir a la página de login del SSO cuando no hay sesión
de reino; (2) tras autenticar, bifurcar por rol — administradores van
directo a la página de admin de `transversal` sin ver cards; asesores ven
una página de cards modulares themeada con el partner propio; (3) el clic en
cualquier card redirige a `transversal` aterrizando en el shell del partner
del asesor (`/:partnerSlug`). El enfoque técnico: `webview-login` implementa
su propia mitad del flujo OIDC Code+PKCE en el navegador (cliente público,
sin backend propio), reutilizando sin cambios el contrato ya congelado en
spec 008 para todo lo que ocurre del lado de `transversal`.

## Technical Context

**Language/Version**: TypeScript + Angular 20.3 (mismo que `transversal`)

**Primary Dependencies**: `@angular/*` 20.3, `@ngrx/signals`, Tailwind CSS
v4; sin librería OIDC de terceros — Code+PKCE implementado con
`crypto.subtle` + `HttpClient` (ver research.md R1)

**Storage**: N/A — sin persistencia; `sessionStorage` solo para el
`code_verifier` transitorio de la transacción PKCE en curso (research.md R2)

**Testing**: Karma/Jasmine (`ng test`, ya configurado en el scaffold)

**Target Platform**: Navegador (SPA estática, sin SSR ni backend propio)

**Project Type**: Web application — frontend puro que consume las APIs
públicas/de sesión ya expuestas por `transversal`

**Performance Goals**: Página de cards themeada visible en <3s tras
completarse la autenticación (spec SC-003)

**Constraints**: Cero backend propio; tokens de identidad nunca persistidos
fuera de memoria o del `sessionStorage` transitorio del `code_verifier`
(spec FR-010); la autorización real (partner activo, resolución de módulo)
permanece server-side en `transversal`, este proyecto solo decide qué
pantalla mostrar

**Scale/Scope**: Tres rutas/estados (`/` como disparador de login o cards
según sesión, `/callback`), dos roles de bifurcación (admin/asesor), sin
catálogo de módulos propio

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`webview-login` no tiene su propia constitución, pero fue scaffolded con
exactamente el mismo stack que gobierna `.specify/memory/constitution.md`
de `transversal` (`@ngrx/signals`, Tailwind v4, zoneless, Angular 20) — se
adopta como aplicable por consistencia de producto (ver research.md R4).

- **I. Estado y Datos**: `SessionUiState` (rol/claims/estado de pantalla) es
  estado síncrono de UI → NgRx Signals, correcto. El único fetch de servidor
  real es `GET /api/theme/:slug` → candidato natural a TanStack Query si se
  añade esa dependencia al proyecto (ya está en `package.json` del
  scaffold); el intercambio de tokens con la IdP es un caso especial (no es
  "estado de servidor" de la app de negocio) y se maneja en un servicio
  dedicado, no en el Store ni en TanStack Query. **PASA**, sin violación.
- **II. Standalone/OnPush**: todas las páginas/componentes nuevos
  (login-trigger implícito, página de cards, página de error) serán
  standalone + `OnPush`, sin `NgModule`. **PASA**.
- **III. Inyección de dependencias**: todo servicio/guard nuevo usa
  `inject()`, `providedIn: 'root'` para singletons. **PASA**.
- **IV. Estilos y Zoneless**: Tailwind v4 ya está wireado en el scaffold;
  zoneless ya configurado en `app.config.ts`. **PASA**.

No se detectan violaciones que requieran la tabla de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/009-webview-login-experiencia-usuario/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── webview-login-routing.contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository: `C:\sofka\bnp\webview-login`, sibling repo)

```text
src/app/
  core/
    auth/
      pkce.ts                  # code_verifier/code_challenge (crypto.subtle), sin dependencia externa
      oidc-client.ts            # buildAuthorizationUrl / exchangeCode, contra la IdP del reino
      session.store.ts          # NgRx Signals: SessionUiState (anonymous|authenticating|authenticated|error)
      auth-claims-model.ts       # AuthClaims (roles, partnerSlug, isAdmin derivado)
  features/
    login/
      login.routes.ts            # ruta raíz '' — dispara redirect o resuelve bifurcación
      pages/
        login-redirect/
          login-redirect.ts       # sin sesión → dispara Authorization Code+PKCE
        callback/
          callback.ts             # procesa /callback, intercambia code, decide next
        access-denied/
          access-denied.ts        # asesor sin partner / error de intercambio
    advisor-cards/
      advisor-cards.routes.ts
      pages/
        cards/
          cards.ts                 # página modular themeada; clic → redirect a transversal
      queries/
        theme-queries.ts           # TanStack Query sobre GET /api/theme/:slug (CORS, 008)
  app.routes.ts
  app.config.ts
src/environments/
  environment.ts                  # URLs de IdP (authorize/token/end_session), client_id, base URL de transversal
  environment.development.ts
```

**Structure Decision**: se sigue la misma convención feature-first de
`transversal/.claude/ARCHITECTURE.md` §1–§4 (guards funcionales, rutas lazy,
NgRx Signals solo para estado síncrono, TanStack Query solo para el fetch de
tema). No hay `backend/` porque el proyecto no tiene ni necesita servidor
propio (research.md R1); el flujo OIDC vive en `core/auth/` como un
conjunto de servicios sin dependencia de terceros.

## Complexity Tracking

*No aplica — ninguna violación de la constitución requiere justificación.*
