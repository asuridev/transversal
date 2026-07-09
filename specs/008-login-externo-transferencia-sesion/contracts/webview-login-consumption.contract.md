# Contract: Responsabilidades de webview-login (actor externo)

**Feature**: 008 | **Repo hermano**: `C:\sofka\bnp\webview-login`

Este contrato fija lo que la app webview-login **debe** hacer para integrarse con la
transversal. La implementación interna vive en su repo y se rige por la **misma
constitución** (standalone + OnPush + signals, `inject()`, TanStack Query para estado de
servidor, Tailwind v4, zoneless, sin axios). No forma parte del alcance de código de este
repo, pero condiciona los contratos server-side de arriba.

## Responsabilidades

1. **Autenticación (SSO client A)**: autenticar al usuario contra el cliente
   `webview-login` del realm `backoffice` (OIDC Code+PKCE). Esto establece la sesión de
   identidad del realm reutilizada por la transversal (silent SSO). Cubre FR-001, FR-002.

2. **Derivar el partner del token propio (D5)**: leer el claim `partner` del token de
   identidad del realm (misma semántica que `derivePartnerRef`: exactamente-uno; `0`/`>1`
   ⇒ sin partner). Cubre FR-008.

3. **Obtener el tema (cross-origin)**: `GET https://<transversal>/api/theme/<slug>` con el
   partner derivado. Aplicar el mapeo `--brand-*` reutilizando el vocabulario de
   `theme-css-vars.ts` (`toCssVars`) y el bloque `@theme`/`:root` de `styles.css`. Estado
   de servidor vía TanStack Query (clave `['theme', slug, version]`), como en la
   transversal. Cubre FR-007, FR-008.

4. **Fallback de tema neutro**: si no hay partner (admins, `0`/`>1` claims), si el partner
   está inactivo/sin tema, o si el tema no está disponible ⇒ aplicar el tema neutro por
   defecto (`__default__`). Nunca aplicar el tema de otro partner. Cubre FR-001b, FR-009.

5. **Página modular de cards (Figma "BO Experiencia Modular", node 12286-272780)**:
   renderizar las cards con el branding aplicado. Cada card conoce su `moduleId` (opaco).

6. **Navegación por card**: el botón de una card redirige el navegador a
   `https://<transversal>/api/auth/login?module=<moduleId>`. **No** enviar rutas internas
   de la transversal; solo el identificador. Cubre FR-010, FR-011.

7. **Retorno de logout**: ser el `post_logout_redirect_uri` del RP-initiated logout de la
   transversal (D4); al recibir el retorno, ofrecer re-login. Cubre FR-014.

## Invariantes exigidos a webview-login

- **No** debe recibir ni almacenar tokens del IdP en el navegador más allá de lo que su
  propia mediación OIDC requiera; nunca reenviarlos a la transversal. La transversal
  rehace su propia sesión vía SSO silencioso (no acepta tokens del cliente). (SC-003)
- **No** debe mantener una definición de tema duplicada: la transversal es la fuente
  autoritativa (consumo vía `GET /api/theme/:slug`). (US2 escenario 4)
- **No** debe proponer rutas destino: solo `moduleId`. (FR-011)

## Criterios de aceptación (validables end-to-end)

- **CT-30**: Tras login en webview-login, la página modular muestra el branding del
  partner del asesor (colores/logo/footer). (US2)
- **CT-31**: Dos asesores de partners distintos ven, cada uno, solo su branding. (SC-002)
- **CT-32**: Admin (sin partner) ve tema neutro en la página modular. (FR-001b)
- **CT-33**: Click en card → aterriza en el módulo correcto de la transversal, autenticado,
  sin re-credenciales. (US1, US3, SC-001)
- **CT-34**: `moduleId` no disponible para el rol/partner ⇒ la transversal aplica fallback
  (no acceso arbitrario). (FR-011)
