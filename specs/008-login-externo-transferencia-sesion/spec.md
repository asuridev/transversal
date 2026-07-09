# Feature Specification: Login Externo (webview-login) y Transferencia de Sesión SSO al Transversal

**Feature Branch**: `008-login-externo-transferencia-sesion`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "el proceso de login se realizará en una aplicación angular independiente (C:\sofka\bnp\webview-login) en un dominio totalmente diferente; tras el login se muestra la página modular (Figma BO Experiencia Modular) y al hacer click en el botón de una card se redirige a la aplicación transversal; el tema de esa página del webview-login debe cargarse con el tema del partner configurado en la aplicación transversal; el usuario siempre ingresa por el webview-login (asociado a una aplicación del SSO) y debe transferir su sesión a la aplicación transversal (asociada a otra aplicación del SSO del mismo reino); una vez en la transversal, el comportamiento es el ya planeado."

## Clarifications

### Session 2026-07-06

- Q: ¿Qué usuarios inician sesión a través de webview-login (todos o solo asesores)? → A: Todos los usuarios del Back Office (asesores y administradores internos) — entrada única por webview-login.
- Q: ¿Dónde se define el mapeo card→ruta de módulo (catálogo server-side vs ruta enviada por el cliente)? → A: Catálogo curado del lado servidor; la webview-login envía un identificador de módulo/card y la transversal resuelve la ruta real.
- Q: ¿Qué ocurre al cerrar sesión o expirar la sesión en la transversal (dos apps SSO, mismo reino)? → A: Logout único de reino: termina la sesión de identidad del reino y devuelve al usuario a webview-login para re-autenticar.
- Q: ¿De dónde obtiene webview-login el partnerSlug para pedir el tema? → A: webview-login deriva el partner de su propio token del SSO (mismo claim del reino) y pide GET /api/theme/:slug a la transversal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Login externo con transferencia de sesión al transversal (Priority: P1)

Un asesor accede siempre por la aplicación de login independiente (webview-login),
alojada en un dominio distinto y asociada a una aplicación del SSO. Tras
autenticarse e interactuar con la página modular, es redirigido a la aplicación
transversal (asociada a otra aplicación del SSO del **mismo reino**) llegando ya
**autenticado**, sin volver a introducir credenciales. La sesión operativa se
establece del lado servidor en la transversal a partir de la identidad ya validada
por el reino.

**Why this priority**: Es el núcleo del cambio: separar el login en una app y
dominio propios y garantizar que la sesión se transfiere de forma segura y
transparente a la transversal. Sin este handoff no hay flujo utilizable; constituye
el MVP mínimo demostrable (el usuario entra por webview-login y termina operando en
la transversal autenticado).

**Independent Test**: Se puede probar completando la autenticación en webview-login y
verificando que, al llegar a la transversal, existe una sesión válida del lado
servidor (con el partner del asesor resuelto) sin que se solicite credenciales
nuevamente.

**Acceptance Scenarios**:

1. **Given** un asesor que abre la webview-login en su dominio propio, **When**
   completa la autenticación con el SSO, **Then** el reino establece una sesión de
   identidad reutilizable por las aplicaciones del mismo reino.
2. **Given** un asesor autenticado en webview-login, **When** es redirigido a la
   transversal, **Then** la transversal establece su propia sesión operativa del lado
   servidor a partir de la identidad del reino, sin volver a pedir credenciales.
3. **Given** un asesor que llega a la transversal con la sesión transferida, **When**
   se resuelve su sesión, **Then** su partner se deriva del lado servidor (del claim
   de identidad) y queda sellado en la sesión, nunca tomado de datos del cliente.
4. **Given** que no existe una sesión de identidad válida en el reino (ausente o
   expirada), **When** el usuario llega a la transversal, **Then** la transversal
   inicia el flujo de login normal en lugar de fallar, sin exponer error técnico.
5. **Given** cualquier fallo en el establecimiento de la sesión en la transversal,
   **When** se procesa el aterrizaje, **Then** el resultado es fail-secure (sin
   sesión, acceso denegado) y ningún token de identidad se expone al navegador.

---

### User Story 2 - Página modular con el tema del partner del transversal (Priority: P2)

Tras el login, la webview-login muestra la página modular de cards (BO Experiencia
Modular). Esta página se renderiza con el **tema del partner** al que pertenece el
asesor —el mismo tema configurado y publicado en la transversal— (colores, logo,
co-branding, tipografía y textos legales), de modo que la experiencia de marca es
consistente entre ambas aplicaciones.

**Why this priority**: La coherencia de marca entre el login externo y la transversal
es un requisito explícito, pero es posterior a que el handoff de sesión funcione. Se
puede entregar de forma incremental sobre US1.

**Independent Test**: Se puede probar autenticando a un asesor de un partner con tema
publicado y verificando que la página modular muestra el branding de ese partner
(colores, logos, footer legal), diferenciable del de otro partner y del tema neutro.

**Acceptance Scenarios**:

1. **Given** un asesor cuyo partner está activo y tiene tema publicado, **When** se
   muestra la página modular, **Then** el branding aplicado (colores, logo,
   co-branding, tipografía, textos legales) corresponde exactamente al de ese partner
   según lo configurado en la transversal.
2. **Given** un asesor cuyo partner está inactivo o sin tema publicado, **When** se
   muestra la página modular, **Then** se aplica un tema neutro por defecto, nunca el
   tema de otro partner.
3. **Given** dos asesores de partners distintos, **When** cada uno ve su página
   modular, **Then** cada página refleja exclusivamente el branding de su propio
   partner, sin mezcla ni fuga de marca ajena.
4. **Given** que la transversal es la fuente autoritativa del tema, **When** cambia el
   tema publicado de un partner, **Then** la página modular refleja el tema vigente sin
   requerir una definición de tema propia y duplicada en la webview-login.

---

### User Story 3 - Navegación por card al módulo correspondiente del transversal (Priority: P3)

Cada card de la página modular representa un módulo del journey. Al hacer click en el
botón de una card, el asesor es redirigido a la ruta específica de ese módulo dentro
de la transversal, aterrizando directamente en la funcionalidad elegida, siempre
dentro del alcance de su único partner.

**Why this priority**: Completa la experiencia (elegir a dónde ir), pero depende de
que el handoff de sesión (US1) ya funcione. Es la capa de navegación sobre el flujo
autenticado.

**Independent Test**: Se puede probar haciendo click en distintas cards y verificando
que cada una lleva al módulo correcto de la transversal, con la sesión activa y el
alcance del partner aplicado.

**Acceptance Scenarios**:

1. **Given** un asesor autenticado viendo la página modular, **When** hace click en el
   botón de una card, **Then** es redirigido a la ruta del módulo correspondiente
   dentro de la transversal.
2. **Given** el identificador de módulo de una card, **When** se procesa el redirect en
   la transversal, **Then** el servidor resuelve ese identificador a la ruta real del
   módulo desde su catálogo curado, rechazando identificadores inexistentes o no
   permitidos para el partner/rol del usuario.
3. **Given** un asesor que aterriza en un módulo de la transversal, **When** opera en
   él, **Then** todo el comportamiento (roles, aislamiento por partner, auditoría)
   corresponde al ya planeado, sin cambios respecto a lo definido en PRD 06/07.

---

### Edge Cases

- **Sesión de identidad del reino ausente o expirada al aterrizar**: la transversal
  inicia el flujo de login normal en vez de mostrar un error; no asume sesión.
- **Claim de partner ausente o múltiple**: si la identidad no resuelve exactamente un
  partner válido, no se establece sesión de asesor (fail-secure, coherente con PRD 07);
  no se elige un partner arbitrariamente.
- **Partner inactivo o sin tema publicado**: la página modular usa el tema neutro por
  defecto; nunca se filtra el tema de otro partner.
- **Destino de card cross-origin o no permitido**: cualquier destino que no resuelva a
  una ruta interna válida de la transversal se rechaza; solo se permiten destinos en la
  lista blanca definida.
- **Intento de acceso cruzado entre partners al aterrizar**: se trata como
  "no encontrado" y se audita, conforme a PRD 07.
- **Tema no disponible temporalmente desde la transversal**: la página modular degrada
  a tema neutro sin bloquear el flujo de login ni la navegación.
- **Reintento o doble redirect**: llegar dos veces al aterrizaje con una sesión ya
  establecida no duplica ni corrompe la sesión operativa.
- **Expiración/cierre durante la operación en la transversal**: al expirar o cerrar la
  sesión, se termina la sesión del reino y el usuario es devuelto a la webview-login; no
  queda una sesión de reino huérfana ni acceso residual en la transversal.
- **Cambio de pertenencia del asesor en la fuente de identidad**: el alcance vigente se
  aplica en la siguiente sesión, sin conservar un alcance obsoleto (coherente con PRD 07).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST hacer que **todos** los usuarios del Back Office (asesores
  y administradores internos) inicien el proceso de login exclusivamente en la aplicación
  webview-login, alojada en un dominio distinto al de la transversal y asociada a su propia
  aplicación del SSO; no existe una segunda superficie de login dentro de la transversal.
- **FR-001b**: Para usuarios sin partner (administradores internos), el sistema MUST
  aplicar el tema neutro por defecto en la página modular (no hay branding de partner),
  reutilizando el mecanismo de fallback de FR-009.
- **FR-002**: El reino de identidad MUST mantener una sesión de identidad compartida
  entre la aplicación del SSO de la webview-login y la aplicación del SSO de la
  transversal (ambas del mismo reino), de modo que autenticarse en la primera habilite
  el establecimiento de sesión en la segunda sin re-ingresar credenciales.
- **FR-003**: La transversal MUST establecer su propia sesión operativa del lado
  servidor aprovechando la sesión de identidad ya establecida en el reino, sin exponer
  tokens de identidad al navegador en ningún punto del flujo.
- **FR-004**: El sistema MUST derivar el partner del asesor del lado servidor a partir
  de su identidad autenticada (claim), nunca de datos suministrados por el cliente,
  coherente con PRD 07.
- **FR-005**: El sistema MUST comportarse de forma fail-secure ante cualquier fallo en
  el establecimiento o transferencia de la sesión (sin sesión, acceso denegado), sin
  filtrar información técnica ni de identidad.
- **FR-006**: Cuando no exista una sesión de identidad válida en el reino al aterrizar
  en la transversal, el sistema MUST iniciar el flujo de login estándar en lugar de
  producir un error.
- **FR-007**: La transversal MUST exponer el tema del partner (proyección pública
  sanitizada: colores/tokens, logos, co-branding, tipografía y textos legales) para su
  consumo por la webview-login, sin incluir ningún dato interno o sensible del partner.
- **FR-008**: La webview-login MUST derivar el partner del asesor a partir de su propio
  token de identidad del reino (mismo claim de partner definido en PRD 07) y renderizar la
  página modular aplicando el tema de ese partner obtenido desde la transversal, de forma
  que el branding sea consistente con el de la transversal.
- **FR-009**: El sistema MUST aplicar un tema neutro por defecto en la página modular
  cuando el partner esté inactivo, no tenga tema publicado o el tema no esté disponible,
  sin exponer nunca el tema de otro partner.
- **FR-010**: Cada card de la página modular MUST estar asociada a un módulo del journey
  de la transversal mediante un **identificador de módulo/card**; la webview-login MUST
  referenciar ese identificador (no una ruta), y la transversal MUST resolverlo a la ruta
  real del módulo a partir de un catálogo curado del lado servidor.
- **FR-011**: El sistema MUST rechazar cualquier identificador de módulo/card que no
  exista en el catálogo server-side (o no esté disponible para el partner/rol del usuario),
  sin redirigir a rutas arbitrarias; el cliente nunca propone la ruta destino.
- **FR-012**: Una vez el asesor aterriza en la transversal, el sistema MUST aplicar el
  comportamiento ya definido (roles y autorización de PRD 06, aislamiento por partner y
  auditoría de PRD 07) sin cambios.
- **FR-013**: El sistema MUST tratar cualquier intento de acceso a un partner ajeno tras
  el aterrizaje como indistinguible de "no encontrado" y dejar traza auditable, conforme
  a PRD 07.
- **FR-014**: Al cerrar sesión o al expirar la sesión operativa en la transversal, el
  sistema MUST terminar la sesión de identidad del reino (logout único de reino) y
  redirigir al usuario a la webview-login para re-autenticarse, de modo que no queden
  sesiones de identidad huérfanas vivas en el reino.

### Key Entities *(include if feature involves data)*

- **Sesión de identidad del reino**: sesión establecida por el SSO al autenticarse en
  la webview-login, reutilizable por las aplicaciones del mismo reino para habilitar el
  establecimiento de sesión en la transversal sin re-credenciales.
- **Sesión operativa de la transversal**: sesión sellada del lado servidor que la
  transversal establece al aterrizar el asesor; contiene la identidad y el partner
  derivado (nunca tokens en el navegador), reutilizando el modelo de sesión existente.
- **Tema público del partner**: proyección sanitizada del tema del partner (tokens de
  color, logos, co-branding, tipografía, textos legales) que la transversal expone y la
  webview-login consume; es la fuente autoritativa única de branding.
- **Card / módulo**: elemento de la página modular que representa un módulo del journey
  y cuyo botón mapea a una ruta destino específica dentro de la transversal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los asesores que se autentican en la webview-login llegan a la
  transversal con una sesión válida sin re-ingresar credenciales (0 solicitudes de
  credenciales adicionales durante la transferencia).
- **SC-002**: El 100% de las páginas modulares de asesores con partner activo y tema
  publicado muestran el branding correcto del partner; los casos restantes muestran el
  tema neutro por defecto, con 0 fugas de branding entre partners.
- **SC-003**: El 0% de los flujos exponen tokens de identidad al navegador en cualquier
  punto (login, página modular, aterrizaje).
- **SC-004**: El 100% de los clicks en cards resuelven a la ruta del módulo correcto
  dentro de la transversal; el 100% de los destinos externos o no permitidos son
  rechazados.
- **SC-005**: La transferencia de sesión es percibida como instantánea por el usuario
  (sin pantalla visible de solicitud de autenticación entre la webview-login y la
  transversal).
- **SC-006**: El 100% de los aterrizajes sin sesión de identidad válida inician el flujo
  de login estándar en lugar de producir un error.
- **SC-007**: Tras el aterrizaje, el 100% de los comportamientos de roles, aislamiento
  por partner y auditoría permanecen conformes a PRD 06/07 (sin regresiones).

## Assumptions

- Ambas aplicaciones del SSO (webview-login y transversal) viven en el **mismo reino**
  de identidad y comparten la sesión de identidad del reino; esta especificación asume
  esa configuración, cuyo registro/detalle se aborda en la fase de diseño.
- La transferencia de sesión se apoya en el flujo de identidad ya existente mediado por
  el servidor (PRD 04/06): la transversal establece su sesión reutilizando la sesión de
  identidad del reino, sin definir un canal de transferencia propietario nuevo.
- El partner del asesor se obtiene del claim de identidad y se resuelve/valida del lado
  servidor, de forma coherente con PRD 07; el modelo de datos concreto no se redefine
  aquí.
- La transversal es la **fuente autoritativa única** del tema del partner; la
  webview-login lo consume y no mantiene una definición de tema duplicada.
- El diseño visual de la página modular corresponde al Figma "BO Experiencia Modular"
  (node 12286-272780); el detalle de layout y componentes se resuelve en la fase de
  plan/implementación, no en esta especificación.
- La implementación de la webview-login vive en un repositorio hermano
  (`C:\sofka\bnp\webview-login`); esta especificación describe el flujo end-to-end y el
  contrato que la transversal expone/consume, sin fijar el detalle interno de esa app.
- El comportamiento post-aterrizaje en la transversal es exactamente el ya planeado
  (PRD 06/07) y no se modifica en esta especificación.
- No se introducen dependencias nuevas fuera de lo ya disponible en la plataforma
  (coherente con la convención de PRD 06/07).

## Dependencies

- **PRD 04 (Arquitectura BFF)**: superficie server-side donde se establece la sesión
  operativa de la transversal y se media la identidad; base del handoff sin exponer
  tokens al navegador.
- **PRD 06 (AuthZ, Roles y Auditoría)**: flujo de autenticación, patrón de derivación de
  atributos de identidad desde el IdP y registro de auditoría reutilizados tras el
  aterrizaje.
- **PRD 07 (Aislamiento de Asesor por Partner)**: derivación del partner por claim del
  lado servidor, aislamiento y auditoría de accesos cruzados aplicados al operar en la
  transversal.
- **PRD 02 (Modelo de Partner y Contrato de Theme)**: catálogo de partners, su estado
  (activo/inactivo) y la proyección pública del tema que la transversal expone.
- **PRD 03 (Theming Dinámico / Anti-FOUC)**: mecanismo de aplicación del tema del partner
  reutilizado por la webview-login para renderizar la página modular con el branding
  correcto.
