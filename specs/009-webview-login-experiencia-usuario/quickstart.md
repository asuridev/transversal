# Quickstart: Validar la experiencia de `webview-login`

## Prerrequisitos

- Reino `backoffice` de RH-SSO/Keycloak levantado con ambos clientes
  registrados: `backoffice-bff` (transversal) y `webview-login` (ver
  `infra/sso/realm/backoffice-realm.json`, spec 008).
- `transversal` corriendo con `WEBVIEW_LOGIN_ORIGIN` y `WEBVIEW_LOGIN_URL`
  configurados (ver `specs/008-login-externo-transferencia-sesion/quickstart.md`).
- `webview-login` corriendo (`ng serve`, sin backend propio) con su
  `environment.ts` apuntando a: la URL de la IdP (authorization/token/
  end_session endpoints del reino), el `client_id` `webview-login`, y la URL
  base de `transversal`.
- Usuarios de prueba ya existentes (spec 008): `admin-user` (sin partner),
  `asesor-a`/partner `banco-a`, `asesor-inactivo`, y un asesor sin claim de
  partner resoluble.

## Escenarios de validación (mapeados a Acceptance Scenarios de spec.md)

1. **Sin sesión activa** (User Story 1): abrir `webview-login` en una
   ventana de incógnito → debe verse la página de login del SSO, ningún
   contenido de cards ni de admin.
2. **Login admin** (User Story 2): autenticar `admin-user` → debe terminar
   en la página de administración de `transversal`, sin pasar por cards.
   Repetir sin cerrar el navegador (misma sesión de reino) → debe saltar
   directo a admin sin pedir credenciales (silent SSO).
3. **Login asesor** (User Story 3): autenticar `asesor-a` → debe verse la
   página de cards themeada con los colores/tokens del partner `banco-a`
   (verificar contra `GET /api/theme/banco-a`). Clic en cualquier card →
   debe aterrizar en el shell `/banco-a` de `transversal`.
4. **Asesor sin partner** (edge case / CT-06): autenticar un usuario sin
   partner resoluble → no debe verse ninguna card ni crearse sesión visible
   en `transversal`; debe mostrarse un estado de error/sin acceso.
5. **Fallo de tema** (edge case): simular una respuesta de error en
   `GET /api/theme/:slug` → la página de cards del asesor debe seguir siendo
   utilizable con un tema neutro/por defecto (no debe bloquear el acceso).
6. **Logout de reino** (CT-08): desde `transversal`, iniciar sesión y
   cerrar sesión (`POST /api/auth/logout`) → el navegador debe terminar de
   vuelta en `webview-login` mostrando la página de login del SSO otra vez.
7. **Acceso directo a ruta protegida**: con el navegador sin sesión, navegar
   directo a la ruta de cards de `webview-login` → debe redirigir al flujo
   de login del SSO, igual que el escenario 1.

## Verificación de no-regresión de contratos existentes

- Confirmar que ningún escenario anterior requirió cambios en
  `specs/008-login-externo-transferencia-sesion/contracts/*` — esta
  iteración solo añade comportamiento de UI en `webview-login`, reutilizando
  el contrato técnico ya congelado.
- Ejecutar la suite existente de `transversal` (`auth-router.test.ts`,
  `module-catalog.test.ts`, `cors.test.ts`) sin cambios esperados en sus
  resultados.

## Comandos

```bash
# transversal (backend + SSR)
cd C:\sofka\bnp\transversal
npm start

# webview-login (SPA)
cd C:\sofka\bnp\webview-login
npm start
```
