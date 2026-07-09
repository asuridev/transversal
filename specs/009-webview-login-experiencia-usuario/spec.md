# Feature Specification: Experiencia de Usuario de Login Externo (webview-login)

**Feature Branch**: `009-webview-login-experiencia-usuario`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "deseo implementar el funcionamiento del proyecto webview-login C:\sofka\bnp\webview-login de modo que cuando esta aplicacion inicie si no hay una sesion activa muestre la pagina de login del sso. si el usuario que se autentica es un administrador debera redirigir a la aplicacion transversal y mostrar la pagina de admin. si se logea un asesor debera mostrar la pagina de cards modulares (diseño Figma: https://www.figma.com/design/C0q2qm3nTwyUHhYyiXYZue/-BO-_Experiencia_Modular?node-id=12286-272780) y cuando el usuario de clic (inicialmente en cualquier card) debera redirigir a la aplicacion transversal y mostrar el modulo de asesor segun el partner."

## Nota de alcance

Esta especificación describe la **experiencia de usuario** de la aplicación
`webview-login` (punto único de entrada al Back Office). El **contrato
técnico** de cómo `webview-login` se comunica con la aplicación transversal
(segundo cliente OIDC del reino, endpoint público de tema con CORS, endpoint
`/api/auth/login?module=`, sellado de sesión, logout único de reino) ya está
definido y congelado en `specs/008-login-externo-transferencia-sesion/`; esta
especificación no lo repite ni lo reabre, solo describe el comportamiento
observable por el usuario que ese contrato debe soportar.

**Actualización respecto a 008**: 008 había clarificado "entrada única para
todos los usuarios (admins → tema neutro)", implicando que el administrador
también vería la página de cards antes de entrar. Esta especificación
**reemplaza** ese punto: el administrador NO ve la página de cards; al
autenticarse es redirigido de inmediato a la página de administración en la
aplicación transversal (ver User Story 2).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acceso sin sesión activa (Priority: P1)

Un usuario (asesor o administrador) abre `webview-login` sin tener una
sesión de reino activa. La aplicación le muestra la página de login del SSO
para que ingrese sus credenciales.

**Why this priority**: Es la puerta de entrada obligatoria a todo el Back
Office; sin esto ningún otro flujo puede comenzar.

**Independent Test**: Abrir `webview-login` en un navegador sin cookies de
sesión previas y verificar que se presenta la pantalla de autenticación del
SSO en vez de cualquier contenido protegido.

**Acceptance Scenarios**:

1. **Given** un usuario sin sesión de reino activa, **When** abre
   `webview-login`, **Then** se le presenta la página de login del SSO y no
   se muestra ningún contenido de cards ni de administración.
2. **Given** un usuario cuyas credenciales son inválidas, **When** las
   envía en la página de login del SSO, **Then** permanece en la página de
   login con un mensaje de error, sin acceso a ningún contenido protegido.

---

### User Story 2 - Autenticación como administrador (Priority: P1)

Un usuario con rol administrativo (`platform-admin`, `partner-editor` o
`auditor`) se autentica exitosamente. La aplicación lo redirige de
inmediato a la aplicación transversal, aterrizando en la página de
administración, sin mostrar la página de cards modulares.

**Why this priority**: Es el segundo flujo crítico de entrada; sin él los
administradores no podrían gestionar partners ni configuración del Back
Office.

**Independent Test**: Autenticar un usuario con rol administrativo y
verificar que termina en la página de administración de transversal sin
pasar por ninguna pantalla intermedia de cards.

**Acceptance Scenarios**:

1. **Given** un usuario con rol administrativo se autentica correctamente,
   **When** se completa la autenticación, **Then** es redirigido
   automáticamente a la aplicación transversal y ve la página de
   administración.
2. **Given** un usuario con rol administrativo ya autenticado en el reino
   (sesión existente), **When** vuelve a abrir `webview-login`, **Then** no
   se le pide credenciales de nuevo y es llevado directo a la página de
   administración en transversal.

---

### User Story 3 - Autenticación como asesor y selección de módulo (Priority: P1)

Un usuario asesor (con un partner activo asociado) se autentica
exitosamente. La aplicación le muestra la página modular de cards (según el
diseño de referencia) themeada con la identidad visual de su partner. Al
hacer clic en cualquiera de las cards, es redirigido a la aplicación
transversal, aterrizando en el módulo de su partner.

**Why this priority**: Es el flujo principal de uso diario para la mayoría
de los usuarios del sistema (los asesores).

**Independent Test**: Autenticar un usuario asesor con partner activo,
verificar que ve la página de cards con el tema de su partner, hacer clic en
una card y confirmar que aterriza en el módulo correspondiente a ese
partner en transversal.

**Acceptance Scenarios**:

1. **Given** un asesor con partner activo se autentica correctamente,
   **When** se completa la autenticación, **Then** ve la página de cards
   modulares themeada con la identidad visual de su partner.
2. **Given** un asesor viendo la página de cards, **When** hace clic en
   cualquiera de las cards, **Then** es redirigido a la aplicación
   transversal y aterriza en el módulo asociado a su partner.
3. **Given** un asesor ya autenticado en el reino (sesión existente),
   **When** vuelve a abrir `webview-login`, **Then** no se le pide
   credenciales de nuevo y ve directamente la página de cards themeada.

---

### Edge Cases

- ¿Qué ocurre si un asesor se autentica pero no tiene ningún partner activo
  asociado (partner inexistente, inactivo, o claim ausente/ambiguo)? El
  sistema no debe mostrar cards ni conceder acceso a ningún módulo; debe
  mostrar un estado de error/sin acceso y no crear ninguna sesión.
- ¿Qué ocurre si falla la obtención del tema del partner (p. ej. el
  servicio de temas no responde)? La página de cards debe seguir siendo
  usable con un tema neutro/por defecto, sin bloquear el acceso del asesor.
- ¿Qué ocurre si un usuario cierra sesión (logout) desde la aplicación
  transversal? Al volver a `webview-login`, o al ser redirigido de vuelta
  tras el logout de reino, debe presentarse nuevamente la página de login
  del SSO.
- ¿Qué ocurre si el intercambio de credenciales/tokens falla por un error
  transitorio? El usuario permanece en la página de login con un mensaje de
  error, sin sesión parcial ni acceso a contenido protegido.
- ¿Qué ocurre si un usuario intenta acceder directamente a una URL protegida
  de `webview-login` (cards o cualquier ruta interna) sin sesión? Debe ser
  llevado a la página de login del SSO, igual que en el acceso inicial.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mostrar la página de login del SSO cuando un
  usuario abre `webview-login` sin una sesión de reino activa.
- **FR-002**: El sistema DEBE reutilizar una sesión de reino ya existente
  (silent SSO) sin volver a solicitar credenciales, bifurcando directamente
  según el rol del usuario.
- **FR-003**: El sistema DEBE, para un usuario autenticado con rol
  administrativo, redirigirlo automáticamente a la aplicación transversal
  aterrizando en la página de administración, sin mostrar la página de
  cards modulares.
- **FR-004**: El sistema DEBE, para un usuario asesor autenticado con
  partner activo, mostrar la página de cards modulares themeada con la
  identidad visual de ese partner.
- **FR-005**: El sistema DEBE, al hacer clic en cualquier card de la página
  modular, redirigir al usuario a la aplicación transversal aterrizando en
  el módulo/vista correspondiente al partner del asesor.
- **FR-006**: El sistema DEBE denegar el acceso a la página de cards y a
  cualquier módulo cuando el asesor autenticado no tiene un partner activo
  asociado, sin crear sesión ni exponer contenido de ningún partner.
- **FR-007**: El sistema DEBE derivar el rol y el partner del usuario a
  partir de la información entregada por el propio proveedor de identidad
  en la autenticación, nunca de un valor elegido por el cliente.
- **FR-008**: El sistema DEBE volver a mostrar la página de login del SSO
  tras un cierre de sesión (logout), tanto si se inicia desde
  `webview-login` como si el usuario es devuelto tras cerrar sesión desde
  la aplicación transversal.
- **FR-009**: El sistema DEBE proteger cualquier ruta interna de
  `webview-login` (página de cards) de modo que un acceso directo sin
  sesión active el flujo de login del SSO en vez de mostrar contenido.
- **FR-010**: El sistema NO DEBE exponer al navegador ni a scripts de
  terceros información sensible de la sesión (tokens de identidad,
  credenciales) más allá de lo estrictamente necesario para determinar el
  rol y el partner mostrados en pantalla.

### Key Entities

- **Usuario autenticado**: representa a la persona que inició sesión;
  atributos relevantes para esta especificación: rol (administrativo o
  asesor) y, si aplica, partner activo asociado.
- **Partner**: entidad ya existente en el Back Office (ver specs previas);
  aporta la identidad visual (tema) que colorea la página de cards del
  asesor.
- **Card de módulo**: elemento visual seleccionable en la página modular
  del asesor; representa un punto de entrada a un módulo de la aplicación
  transversal para el partner del asesor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los usuarios sin sesión activa que abren
  `webview-login` ven la página de login del SSO antes de cualquier otro
  contenido.
- **SC-002**: El 100% de los administradores autenticados llegan a la
  página de administración de transversal sin ver la página de cards.
- **SC-003**: El 100% de los asesores autenticados con partner activo ven
  la página de cards themeada con la identidad visual correcta de su
  partner en menos de 3 segundos tras completarse la autenticación.
- **SC-004**: El 100% de los clics en una card de asesor resultan en
  aterrizar en el módulo correspondiente al partner correcto del asesor (0%
  de aterrizajes en el módulo de un partner distinto).
- **SC-005**: El 0% de los asesores sin partner activo logra ver contenido
  de la página de cards o de cualquier módulo.
- **SC-006**: El 100% de los cierres de sesión devuelven al usuario a la
  página de login del SSO en su siguiente intento de acceso.

## Assumptions

- El contrato técnico de integración entre `webview-login` y la aplicación
  transversal (segundo cliente OIDC del mismo reino, endpoint público de
  tema con CORS, endpoint de inicio de sesión por módulo, sellado de
  sesión, logout único de reino) ya está definido en
  `specs/008-login-externo-transferencia-sesion/` y se reutiliza sin
  cambios; esta especificación no repite esas decisiones técnicas.
- El diseño visual y de contenido de la página de cards modulares del
  asesor sigue el archivo de Figma de referencia provisto
  (`-BO-_Experiencia_Modular`); el número exacto y etiquetas de las cards se
  toman de ese diseño y no se fijan aquí.
- Inicialmente todas las cards de la página modular llevan al mismo destino
  (el módulo/vista de partner ya existente en transversal); una
  segmentación de cards a distintos módulos específicos queda fuera de
  alcance de esta iteración y podrá especificarse en una siguiente.
- La derivación de rol y partner a partir del proveedor de identidad, y la
  política de "fail-secure" ante partner inactivo/ausente, reutilizan la
  lógica ya existente en el Back Office (specs 006 y 007), no se
  reimplementan.
- Se asume conectividad estable de red entre el navegador del usuario, el
  proveedor de identidad y ambas aplicaciones (webview-login y
  transversal).
