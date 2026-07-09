<!-- SPECKIT START -->
The current feature is **Experiencia de Usuario de Login Externo
(webview-login)**. Its plan is at
`specs/009-webview-login-experiencia-usuario/plan.md`, with design artifacts
alongside it: `research.md` (R1..R4), `data-model.md`, `contracts/`
(webview-login-routing) y `quickstart.md`. La spec está en
`specs/009-webview-login-experiencia-usuario/spec.md`. Próximo paso: `/speckit-tasks`.

Enfoque: `webview-login` (repo hermano `C:\sofka\bnp\webview-login`, hoy un
scaffold Angular 20 vacío, SPA puro sin backend/SSR) implementa su propia
mitad del flujo OIDC Code+PKCE **en el navegador**, como cliente público del
segundo cliente SSO `webview-login` del reino `backoffice` (ver spec 008,
que sigue vigente para el contrato técnico transversal↔webview-login: tema
vía `GET /api/theme/:slug` con CORS, `GET /api/auth/login?module=`, logout
único de reino). **Decisión de 009 que actualiza un punto de 008**: el
administrador YA NO pasa por la página de cards — al autenticarse se
redirige de inmediato a la página de admin de transversal. El asesor sí ve
la página de cards modulares (diseño Figma de referencia) themeada por su
partner; el clic en cualquier card redirige al shell existente
`/:partnerSlug` de transversal (no a un `moduleId` nuevo del catálogo).

For prior planned context, see
`specs/008-login-externo-transferencia-sesion/plan.md` (contrato técnico
transversal↔webview-login, server-side), `specs/007-aislamiento-asesor-partner/plan.md`
(aislamiento asesor→partner, server-side) y `specs/006-authz-roles-auditoria/plan.md`
(AuthZ, Roles y Auditoría — Back Office).
<!-- SPECKIT END -->
