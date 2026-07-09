# Feature Specification: Arquitectura BFF (Backend for Frontend)

**Feature Branch**: `004-arquitectura-bff`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "define la especificacion segun este prd prds/04-arquitectura-bff.md"

## User Scenarios & Testing *(mandatory)*

<!--
  Esta feature define la FRONTERA entre el front y el mundo externo (Mashery,
  secretos, almacenamiento de assets). Consume el modelo/contrato de
  theme (feature 002) y habilita el theming anti-FOUC (feature 003) y el Back
  Office (features de administración). El actor "browser" NUNCA ve secretos.
-->

### User Story 1 - Ningún secreto llega jamás al browser (frontera segura) (Priority: P1)

Un usuario final recorre el journey de un partner desde su navegador. Todo lo que
el navegador envía o recibe pasa por una **única frontera pública** (`/api/*`):
en ningún artefacto entregado al cliente (código descargado, respuestas de red,
estado transferido para hidratar la experiencia) aparece jamás una credencial,
una clave de integración, un endpoint interno de Mashery ni un identificador
sensible de integración. Las credenciales reales viven solo del lado servidor.

**Why this priority**: Es la **regla dura** del producto y el motivo de existir de
esta capa: *ningún token, API key o ID sensible de integración llega jamás al
browser*. Una fuga aquí compromete a todos los partners y su integración con
Mashery. Sin esta garantía, ninguna de las demás capacidades es
aceptable para producción.

**Independent Test**: Se puede probar inspeccionando el código descargado por el
navegador y el tráfico de red durante un journey completo, verificando que **no**
aparece ninguna API key, endpoint de Mashery ni ID de integración, y que el estado
transferido para hidratar solo contiene la proyección pública del theme.

**Acceptance Scenarios**:

1. **Given** una experiencia de partner cargada, **When** se inspecciona el código
   descargado por el navegador, **Then** **no** se encuentra ninguna credencial,
   clave, endpoint interno ni ID de integración.
2. **Given** un journey en curso, **When** se inspecciona todo el tráfico de red del
   navegador, **Then** el browser solo se comunica con la frontera pública `/api/*`
   y ninguna respuesta contiene datos sensibles de integración.
3. **Given** la experiencia hidratándose en el cliente, **When** se inspecciona el
   estado transferido desde el servidor, **Then** solo contiene la **proyección
   pública** del theme (sin secretos, endpoints ni IDs de integración).

---

### User Story 2 - El journey se orquesta con las credenciales del partner correcto (Priority: P1)

Un usuario final ejecuta una acción del journey de venta (p. ej. cotizar o
enviar una solicitud). La frontera traduce esa acción en una llamada a
**Mashery** (endpoint único, compartido por todos los partners)
**usando la apiKey propia del partner activo**, resuelta del lado servidor por
request. El usuario obtiene el resultado sin que su navegador conozca nunca
hacia dónde ni con qué credencial se realizó la integración.

**Why this priority**: Es el valor funcional central de la capa: sin la
orquestación por partner, el journey de venta no puede operar. Cada partner
tiene su propia apiKey contra el mismo Mashery; aplicar la apiKey
equivocada rompería la integración o expondría a un partner con la credencial
de otro.

**Independent Test**: Se puede probar ejecutando una acción del journey para un
partner y verificando que la llamada saliente a Mashery usa el endpoint de
Mashery y la apiKey de **ese** partner (resueltos en servidor, con el
secreto mockeado en prueba), y no la de otro.

**Acceptance Scenarios**:

1. **Given** un partner activo con integración configurada, **When** el usuario
   ejecuta una acción del journey, **Then** la llamada saliente a Mashery se realiza
   con el endpoint fijo de Mashery y la apiKey de ese partner, resueltos del
   lado servidor.
2. **Given** dos partners con integraciones distintas, **When** cada uno ejecuta la
   misma acción del journey, **Then** cada llamada usa el mismo endpoint de
   Mashery compartido pero exclusivamente la apiKey de su propio partner, sin
   mezclar apiKeys entre partners.
3. **Given** una acción del journey, **When** se resuelve la integración del partner,
   **Then** las credenciales se obtienen del gestor de secretos por request y **no**
   se serializan hacia el cliente ni al estado transferido.

---

### User Story 3 - El theme público se sirve por slug, cacheado (Priority: P1)

La experiencia del front solicita el branding de un partner a la frontera pública
por su `slug`. La frontera responde la **proyección pública** del theme (sin
datos sensibles), con directivas de caché que permiten reutilizarlo en las capas
intermedias (servidor/CDN) sin volver a consultar el origen en cada visita.

**Why this priority**: Es la pieza que habilita el theming anti-FOUC (feature 003):
el mismo proceso que renderiza del lado servidor resuelve el theme y lo entrega
sin secretos y cacheado. Es P1 porque el branding correcto y rápido es requisito
de la experiencia de todos los partners.

**Independent Test**: Se puede probar solicitando el theme de un partner por su
`slug` y verificando que la respuesta tiene el shape público definido en la
feature `002`, sin secretos, y que incluye directivas de caché reutilizables.

**Acceptance Scenarios**:

1. **Given** un partner activo con theme publicado, **When** se solicita su theme
   público por `slug`, **Then** la respuesta contiene la proyección pública del
   theme (contrato de la feature `002`) sin ningún dato sensible.
2. **Given** una respuesta de theme público, **When** se inspeccionan sus directivas
   de caché, **Then** permiten su reutilización en las capas intermedias sin
   reconsultar el origen en cada visita.
3. **Given** la lista de partners servibles requerida por el ruteo (feature `001`),
   **When** el front la solicita, **Then** la frontera devuelve solo los `slugs`
   activos, sin datos sensibles.

---

### User Story 4 - Los endpoints de administración están protegidos (Priority: P2)

Un administrador del Back Office gestiona partners (listar, crear, editar theme,
publicar versión, dar de baja, subir assets, consultar auditoría) a través de
endpoints de administración. Cada uno exige una sesión válida de administrador;
una petición sin credenciales válidas es rechazada. Además, ninguna respuesta de
administración devuelve secretos en claro: como máximo indica si una credencial
está configurada o no.

**Why this priority**: Habilita la operación del Back Office (features 05/06) sobre
una frontera protegida. Es P2 porque el valor de la experiencia pública (US1–US3)
se entrega antes, pero la administración es necesaria para operar los partners de
forma segura.

**Independent Test**: Se puede probar invocando un endpoint de administración sin
credenciales válidas y verificando que es rechazado, y con credenciales válidas
verificando que la respuesta no expone secretos en claro (solo metadatos como
"credencial configurada sí/no").

**Acceptance Scenarios**:

1. **Given** un endpoint de administración, **When** se invoca sin una sesión válida
   de administrador, **Then** la petición es rechazada (no autorizada) y no ejecuta
   ninguna acción.
2. **Given** un administrador autenticado, **When** consulta o edita un partner con
   integración configurada, **Then** la respuesta indica el estado de la credencial
   (configurada o no) pero **nunca** devuelve el secreto en claro.
3. **Given** una operación de administración (crear, editar, publicar, dar de baja,
   subir asset), **When** se ejecuta con credenciales válidas, **Then** se realiza a
   través del puerto de persistencia de partners, sin acceso directo a la base de
   datos desde el manejador.

---

### User Story 5 - Rotar una credencial surte efecto sin redeploy (Priority: P2)

Un operador rota una credencial de integración de un partner en el gestor de
secretos. A partir de ese momento, y dentro de una ventana acotada de refresco,
las nuevas acciones del journey de ese partner usan la credencial nueva **sin**
necesidad de un nuevo despliegue de la aplicación.

**Why this priority**: La rotación de secretos sin redeploy es un requisito
operativo y de seguridad: permite responder a una credencial comprometida o a una
rotación programada sin ciclo de desarrollo. Es P2 porque depende de que la
orquestación por partner (US2) ya exista.

**Independent Test**: Se puede probar cambiando la credencial de un partner en el
gestor de secretos (mockeado en prueba) y verificando que una acción posterior del
journey —tras la ventana de refresco— usa el nuevo valor, sin redeploy.

**Acceptance Scenarios**:

1. **Given** un partner con integración en uso, **When** se rota su credencial en el
   gestor de secretos, **Then** las acciones posteriores del journey —tras la
   ventana de refresco— usan la credencial nueva sin redeploy.
2. **Given** una credencial recién rotada, **When** se resuelve la integración del
   partner, **Then** el valor se lee en caliente del gestor de secretos (con caché
   corta e invalidación), no de una copia fija en el artefacto desplegado.

---

### User Story 6 - Los errores de Mashery se normalizan sin filtrar detalles internos (Priority: P3)

Durante una acción del journey, Mashery falla o responde con
un error. La frontera traduce ese fallo a un **formato de error uniforme** para el
front (coherente con el manejo de errores de la aplicación), sin filtrar detalles
internos de Mashery (trazas, endpoints, mensajes crudos). Ante lentitud o caída de
Mashery, la frontera acota el impacto con tiempos de espera y reintentos acotados.

**Why this priority**: Mejora la robustez y evita fugas de información, pero el
journey y la frontera segura funcionan sin esta normalización afinada. Es P3
porque es una capa de calidad sobre las capacidades centrales.

**Independent Test**: Se puede probar forzando distintos fallos de Mashery
(mockeados) y verificando que el front recibe siempre el formato de error uniforme,
sin detalles internos de Mashery, y que un Mashery lento no cuelga indefinidamente la
respuesta.

**Acceptance Scenarios**:

1. **Given** una acción del journey, **When** Mashery responde con un error,
   **Then** el front recibe un error en el formato uniforme de la aplicación, sin
   detalles internos de Mashery.
2. **Given** Mashery lento o caído, **When** el usuario ejecuta una acción del
   journey, **Then** la frontera acota la espera (tiempo de espera y reintentos
   acotados) y degrada de forma controlada, sin colgar la experiencia
   indefinidamente.

---

### Edge Cases

- **Intento de serializar un secreto al estado transferido**: debe existir una
  restricción explícita (allowlist) de campos serializables hacia el cliente, de
  modo que solo el theme público cruce la frontera; un secreto nunca puede filtrarse
  por descuido al estado de hidratación.
- **Partner mal configurado que apunta a una credencial equivocada**: la resolución
  de integración debe fallar de forma controlada (sin usar credenciales de otro
  partner); la detección temprana es responsabilidad del alta/validación de
  conectividad (feature de administración).
- **Mashery lento o caído**: tiempos de espera, reintentos acotados y corte de
  circuito evitan que un Mashery degradado agote los recursos de la frontera.
- **Reinicio o caída de la única instancia (V1 single-node)**: al arrancar, la
  persistencia se restaura desde el respaldo continuo; las escrituras poco
  frecuentes acotan el impacto de un reinicio.
- **Enumeración de slugs en endpoints públicos**: los endpoints públicos deben
  limitar la tasa de peticiones para mitigar el sondeo de `slugs` (coherente con la
  feature `001`).
- **Entrada inválida en cualquier endpoint** (`slug`, payload de theme, upload de
  asset): la frontera valida la entrada y rechaza payloads malformados antes de
  operar.
- **Escalado bajo carga (V1 single-node)**: la lectura del theme se apoya en la
  persistencia local y en la caché/CDN; el escalado horizontal se habilita
  posteriormente cambiando el adaptador de persistencia, sin reescribir los
  manejadores.

## Requirements *(mandatory)*

### Functional Requirements

#### Frontera y secretos

- **FR-001**: El navegador DEBE comunicarse **únicamente** con la frontera pública
  `/api/*`; ninguna llamada del cliente va directamente a servicios externos o a
  Mashery.
- **FR-002**: Ningún artefacto entregado al cliente (código descargado, respuestas
  de red, estado transferido para hidratar) DEBE contener credenciales, claves de
  integración, endpoints internos ni IDs sensibles de integración.
- **FR-003**: Los **secretos por partner** DEBEN leerse del gestor de secretos del
  lado servidor, **por request**, y **nunca** serializarse hacia el cliente ni al
  estado transferido de hidratación.
- **FR-004**: Los secretos NO DEBEN estar hardcodeados ni versionados en el
  repositorio; su fuente es el gestor de secretos o variables de entorno inyectadas
  en runtime (Constitución de seguridad).
- **FR-005**: El sistema DEBE separar **configuración visual** (theme, que vive en la
  persistencia de partners) de **secretos de integración** (que viven en el gestor de
  secretos); ambos **nunca** se mezclan en el mismo almacén.
- **FR-006**: Una credencial rotada en el gestor de secretos DEBE surtir efecto
  **sin redeploy**, leída en caliente con caché corta e invalidación.

#### Theme público y contrato

- **FR-007**: La frontera DEBE servir la **proyección pública** del theme de un
  partner por su `slug`, con el shape definido en la feature `002` y **sin** datos
  sensibles.
- **FR-008**: La respuesta del theme público DEBE incluir directivas de **caché**
  (server-side/CDN) que permitan su reutilización sin reconsultar el origen en cada
  visita.
- **FR-009**: La frontera DEBE exponer la **lista de `slugs` activos** requerida por
  el ruteo de tenant (feature `001`), sin datos sensibles.
- **FR-010**: Las respuestas públicas **nunca** DEBEN incluir credenciales, endpoints
  internos ni IDs de integración.

#### Orquestación del journey

- **FR-011**: La frontera DEBE **orquestar** las acciones del journey contra
  Mashery **inyectando el endpoint fijo y compartido de Mashery y la
  apiKey del partner activo**, resueltos del lado servidor.
- **FR-012**: Cada llamada saliente a Mashery DEBE usar exclusivamente la apiKey
  del partner correspondiente contra el endpoint compartido de Mashery, sin
  mezclar apiKeys entre partners.
- **FR-013**: La frontera DEBE **normalizar** los errores de Mashery a un formato de
  error uniforme para el front, **sin** filtrar detalles internos de Mashery.
- **FR-014**: Ante lentitud o caída de Mashery, la frontera DEBE acotar el impacto con
  **tiempos de espera, reintentos acotados y corte de circuito**, degradando de forma
  controlada.

#### Administración

- **FR-015**: Los endpoints de administración (listar, crear, editar/publicar theme,
  dar de baja, subir assets, auditoría) DEBEN estar **protegidos**: una petición sin
  sesión válida de administrador es rechazada (no autorizada) (feature 06).
- **FR-016**: Las respuestas de administración **no** DEBEN devolver secretos en
  claro; como máximo exponen metadatos (p. ej. "credencial configurada sí/no").
- **FR-017**: La frontera DEBE **intermediar** los uploads de assets hacia el
  almacenamiento de objetos (URL firmada o proxy), sin exponer credenciales del
  almacenamiento al cliente.

#### Persistencia, seguridad y observabilidad

- **FR-018**: La frontera DEBE acceder a la persistencia de partners **solo** a través
  del **puerto de repositorio** (feature `002`); ningún manejador ejecuta acceso
  directo a la base de datos.
- **FR-019**: La frontera DEBE **validar la entrada** de todos los endpoints (`slug`,
  payloads de theme, uploads) y rechazar payloads malformados.
- **FR-020**: Los endpoints públicos DEBEN aplicar **límite de tasa** (rate limiting)
  para mitigar la enumeración de `slugs`.
- **FR-021**: La frontera DEBE emitir **logs de error y trazas correlacionadas por
  `partnerSlug`** para observabilidad (feature 07), sin incluir secretos en los logs.
- **FR-022**: El estado transferido para hidratar el cliente DEBE limitarse por una
  **allowlist explícita** de campos serializables (solo el theme público).

### Key Entities *(include if feature involves data)*

- **Frontera pública (`/api/*`)**: único punto de contacto del navegador con el
  backend; agrupa los endpoints públicos (theme, slugs activos, journey) y de
  administración. Diseñada para no transportar nunca datos sensibles al cliente.
- **Credencial del partner (secreto)**: `apiKey` propia de cada partner para
  autenticarse contra Mashery, único y compartido por todos
  los partners (mismo endpoint); vive en el gestor de secretos junto con el
  endpoint de Mashery, se resuelve por request del lado servidor y nunca cruza
  al cliente.
- **Proyección pública de theme (salida)**: contrato de branding sin secretos
  (definido en la feature `002`) que la frontera sirve por `slug` y cachea; es la
  única representación de theme que llega al cliente.
- **Sesión de administración**: credencial/rol que autoriza las operaciones del Back
  Office; sin ella, los endpoints de administración rechazan la petición (feature 06).
- **Error uniforme del front**: formato normalizado al que la frontera traduce los
  fallos de Mashery, sin detalles internos, coherente con el manejo de errores de la
  aplicación.
- **Traza correlacionada**: registro de error/observabilidad asociado a un
  `partnerSlug`, sin secretos, para diagnóstico por partner (feature 07).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Inspeccionar el código descargado por el navegador y el tráfico de red
  durante un journey completo revela **cero** API keys, endpoints de Mashery o IDs de
  integración.
- **SC-002**: El **100%** de la comunicación del navegador ocurre contra la frontera
  pública `/api/*`; **cero** llamadas del cliente van directamente a servicios
  externos o a Mashery.
- **SC-003**: Una acción del journey golpea Mashery con las credenciales del partner
  **correcto** en el **100%** de los casos probados, resueltas del lado servidor.
- **SC-004**: `GET` del theme público por `slug` responde el shape público de la
  feature `002`, cacheado, con **cero** campos sensibles en la respuesta.
- **SC-005**: Rotar una credencial en el gestor de secretos surte efecto en las
  acciones posteriores del journey **sin redeploy**, dentro de la ventana de refresco
  definida.
- **SC-006**: Un endpoint de administración invocado sin credenciales válidas es
  rechazado (no autorizado) en el **100%** de los casos; ninguna respuesta de
  administración expone secretos en claro.
- **SC-007**: El estado transferido para hidratar contiene **únicamente** la
  proyección pública del theme; **cero** ocurrencias de secretos o datos de
  integración en el estado transferido.
- **SC-008**: Ante distintos fallos de Mashery, el front recibe el formato de error
  uniforme en el **100%** de los casos, sin **ninguna** filtración de detalles
  internos de Mashery.
- **SC-009**: Las pruebas de la frontera cubren, como mínimo, la **proyección
  pública**, la **resolución de secretos** (mockeada) y la **normalización de
  errores** (exigido por la Constitución de seguridad).

## Assumptions

- **Decisión de arquitectura ya fijada (PRD 00/04)**: la frontera BFF **es** el
  servidor de render del lado servidor de la aplicación (un solo repositorio, un
  solo deploy). Los nombres concretos de mecanismo (SSR de Angular, route handlers
  de Node, `fetch`/`undici`, estado transferido/`TransferState`) son detalle de
  planificación; esta feature define **responsabilidades, contrato y garantías de
  seguridad**, no su implementación.
- **Dependencias entre features** (fuera de re-discusión aquí):
  - El **modelo de partner y contrato de theme** (feature `002-modelo-partner-theme`)
    provee la **proyección pública** del theme y el **puerto de repositorio** de
    persistencia. Esta feature **sirve** ese contrato y **usa** ese puerto; no los
    redefine.
  - La **resolución de tenant y ruteo** (feature `001-resolucion-tenant-routing`)
    consume la lista de `slugs` activos que esta frontera expone.
  - El **theming anti-FOUC** (feature `003-theming-dinamico-anti-fouc`) consume el
    theme público que esta frontera sirve y cachea.
  - La **autorización/roles/auditoría** (feature 06) define el mecanismo de SSO que
    protege los endpoints de administración; esta feature **exige** la protección,
    no define el mecanismo de identidad.
  - El **Back Office** (feature 05) consume los endpoints de administración
    (incluida la prueba de conectividad server-side en el alta de partners).
- **Modelo de despliegue V1 (single-node)**: hay **una sola instancia** que lee y
  escribe su persistencia local a través del puerto de repositorio; un respaldo
  continuo la replica a un bucket y la restaura al arrancar. El escalado horizontal
  se habilita posteriormente **cambiando el adaptador del puerto de persistencia**
  (p. ej. a Postgres), sin reescribir los manejadores (features `002`/07).
- **Gestión de secretos**: la fuente de secretos es un gestor de secretos externo o
  variables de entorno inyectadas en runtime; su provisión y disponibilidad se
  asumen resueltas por la plataforma. Los valores de ventana de refresco/caché corta
  de secretos, `Cache-Control`/CDN del theme y parámetros de tiempo de
  espera/reintentos/corte de circuito son parámetros de configuración; se asumen
  valores estándar de la industria salvo indicación contraria en planificación.
- **Mismo origen**: al servirse `/api/*` desde el mismo host que la aplicación, la
  superficie CORS es mínima y no se re-discute aquí.
- La **regla anti-`axios`** de la Constitución protege el bundle del cliente; el
  cliente HTTP del runtime servidor de la frontera es detalle de planificación y no
  contradice esa regla.
