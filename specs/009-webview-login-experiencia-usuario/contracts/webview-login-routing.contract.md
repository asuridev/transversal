# Contract: Rutas y estados de `webview-login`

Este contrato describe la superficie de rutas/estados de la propia
aplicación `webview-login` (contrato de UI de aplicación, no una API HTTP).
El contrato de comunicación con `transversal` (endpoints, CORS, sellado de
sesión) está definido en
`specs/008-login-externo-transferencia-sesion/contracts/webview-login-consumption.contract.md`
y no se repite aquí.

## Rutas

| Ruta | Guard/condición | Comportamiento |
|---|---|---|
| `/` | ninguna sesión de UI (`status: 'anonymous'`) | Inicia el redirect Authorization Code+PKCE hacia la IdP del reino `backoffice` (cliente `webview-login`). No renderiza contenido propio — es un disparador de redirect. |
| `/` | `status: 'authenticated'`, `claims.isAdmin === true` | Redirección de documento completa (`window.location.href`) a `GET https://<transversal>/api/auth/login?module=admin`. |
| `/` | `status: 'authenticated'`, `claims.isAdmin === false`, `claims.partnerSlug` presente | Muestra la página de cards modulares themeada. |
| `/` | `status: 'authenticated'`, `claims.isAdmin === false`, `claims.partnerSlug` ausente | Estado de error/sin acceso (CT-EDGE-1) — no crea sesión visible, no ofrece cards. |
| `/callback` | recibido tras el redirect de la IdP | Intercambia `code` por tokens (PKCE), decodifica claims, transita `SessionUiState` a `authenticated` o `error`, y navega de vuelta a `/`. |

## Estados (CT)

- **CT-01 (login inicial)**: sin sesión de reino → `/` dispara el redirect
  a la IdP sin mostrar ningún contenido intermedio (spec FR-001).
- **CT-02 (silent SSO)**: con sesión de reino ya activa (cookie de IdP
  presente) → el redirect a la IdP retorna inmediatamente el `code` sin
  pedir credenciales, y `/callback` procede igual que CT-01 (spec FR-002).
- **CT-03 (admin)**: `claims.isAdmin === true` → redirect inmediato a
  `/api/auth/login?module=admin` en transversal, sin pasar por `/` con
  cards (spec FR-003, User Story 2).
- **CT-04 (asesor con partner)**: `claims.isAdmin === false` y
  `partnerSlug` resuelto → página de cards, themeada vía
  `GET /api/theme/:slug` (CORS, contrato 008) (spec FR-004).
- **CT-05 (click en card)**: cualquier card → redirect de documento a
  `https://<transversal>/api/auth/login?module=<moduleId-o-equivalente>`,
  que en transversal resuelve al shell `/:partnerSlug` del asesor (spec
  FR-005).
- **CT-06 (asesor sin partner)**: `partnerSlug` ausente → estado de error,
  ninguna card visible, ninguna sesión creada (spec FR-006, edge case).
- **CT-07 (fallo de intercambio de tokens)**: error en `/callback` → vuelve
  a `status: 'error'`, se puede reintentar desde `/` (spec edge case).
- **CT-08 (logout)**: tras `POST /api/auth/logout` en transversal
  (RP-initiated, 008), el `post_logout_redirect_uri` apunta de vuelta a
  `webview-login` → `SessionUiState` se reinicia a `anonymous`, próxima
  visita repite CT-01 (spec FR-008).

## Fuera de alcance de este contrato

- Verificación criptográfica de la firma del `id_token` en el navegador (no
  requerida — ver research.md R3; la autorización real ocurre server-side en
  transversal).
- Definición de un `moduleId` específico por card de asesor — todas las
  cards apuntan al mismo destino (`/:partnerSlug`) en esta iteración (spec
  Assumptions).
