# Feature Specification: Aislamiento de Asesor por Partner (Tenant Isolation)

**Feature Branch**: `007-aislamiento-asesor-partner`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "un asesor pertenece solo a un partner de modo que si un asesor pertenece a un partnerA NO PUEDE TENER acceso a las vistas del partnerB u otro, solo la vista del partner al cual pertenece; validar la posibilidad, garantizar la seguridad del lado del servidor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Asesor operando exclusivamente la superficie de su partner (Priority: P1)

Un asesor del banco inicia sesión y opera el journey de venta. Su identidad está
vinculada a un único partner (el banco al que pertenece). Al autenticarse, el
sistema determina su partner del lado servidor y le presenta únicamente la
superficie, la marca y los datos de ese partner. El asesor nunca ve ni puede
seleccionar la vista de otro partner.

**Why this priority**: Es la esencia del requisito de aislamiento multi-tenant.
Sin la vinculación asesor→partner resuelta del lado servidor, cualquier otra
protección es incompleta. Constituye el MVP mínimo demostrable (un asesor entra
y solo existe su partner para él).

**Independent Test**: Se puede probar autenticando a un asesor asignado al
partner A y verificando que toda la superficie que ve (marca, listados,
recursos) corresponde exclusivamente al partner A, sin ningún selector, enlace o
dato de otros partners.

**Acceptance Scenarios**:

1. **Given** un asesor cuya identidad está vinculada al partner A, **When**
   inicia sesión, **Then** el sistema resuelve su partner del lado servidor y le
   presenta únicamente la superficie y los datos del partner A.
2. **Given** un asesor autenticado del partner A, **When** navega por el journey,
   **Then** toda marca, contenido y dato mostrado pertenece al partner A y no
   existe forma en la interfaz de cambiar a otro partner.
3. **Given** un asesor sin partner asignado o con una vinculación no resoluble,
   **When** intenta acceder, **Then** se le niega el acceso (sin partner por
   defecto) con un mensaje comprensible.

---

### User Story 2 - Rechazo del lado servidor de accesos cruzados entre partners (Priority: P1)

Aunque un asesor manipule una petición para referenciar un recurso, identificador
o superficie de otro partner (por ejemplo cambiando un identificador de partner
en la URL, en un parámetro o en el cuerpo de la petición), el servidor rechaza la
operación. La pertenencia al partner se deriva de la sesión del lado servidor, no
de datos suministrados por el cliente.

**Why this priority**: La interfaz nunca es la frontera de seguridad. El objetivo
declarado ("garantizar la seguridad del lado del servidor") exige que el
aislamiento se aplique en el servidor frente a peticiones adversariales. Es
imprescindible junto con US1 para el MVP.

**Independent Test**: Se puede probar autenticado como asesor del partner A y
emitiendo peticiones que referencien recursos o identificadores del partner B,
verificando que todas se rechazan sin filtrar datos del partner B.

**Acceptance Scenarios**:

1. **Given** un asesor autenticado del partner A, **When** emite una petición que
   referencia explícitamente un recurso del partner B, **Then** el servidor
   rechaza la operación y no revela datos del partner B.
2. **Given** un asesor autenticado del partner A, **When** suministra un
   identificador de partner distinto (en URL, parámetro, cabecera o cuerpo),
   **Then** el servidor ignora ese valor y aplica exclusivamente el partner
   derivado de la sesión.
3. **Given** una petición de lectura de un recurso cuyo identificador existe pero
   pertenece al partner B, **When** la realiza un asesor del partner A, **Then**
   el resultado es indistinguible de "no encontrado" (no se confirma la
   existencia del recurso ajeno).
4. **Given** una operación de mutación sobre un recurso del partner B por un
   asesor del partner A, **When** se procesa, **Then** se rechaza y no se produce
   ningún cambio.

---

### User Story 3 - Alcance automático de listados y consultas al partner del asesor (Priority: P2)

Todas las lecturas colectivas (listados, búsquedas, agregaciones, exportaciones)
que realiza un asesor quedan acotadas automáticamente a su partner, sin depender
de que el cliente envíe un filtro por partner. No hay fuga de conteos, totales ni
resultados de otros partners.

**Why this priority**: Los accesos cruzados no solo ocurren por identificador
directo (US2); una consulta sin filtro podría devolver datos de todos los
partners. Cierra la fuga por omisión. Depende de que la pertenencia al partner ya
se resuelva (US1) y se aplique en servidor (US2).

**Independent Test**: Se puede probar poblando recursos de varios partners y
verificando que, como asesor del partner A, cualquier listado, búsqueda o
agregado devuelve exclusivamente elementos del partner A, con conteos y totales
consistentes con ese subconjunto.

**Acceptance Scenarios**:

1. **Given** recursos de los partners A y B, **When** un asesor del partner A
   lista o busca recursos sin especificar filtro de partner, **Then** obtiene
   únicamente recursos del partner A.
2. **Given** un asesor del partner A, **When** obtiene conteos, totales o
   exportaciones, **Then** reflejan exclusivamente el partner A.
3. **Given** un asesor del partner A que intenta forzar un filtro por el partner
   B, **When** ejecuta la consulta, **Then** el filtro ajeno no amplía el
   alcance y el resultado permanece acotado al partner A.

---

### Edge Cases

- **Vinculación asesor→partner ausente**: si la identidad del asesor no trae una
  pertenencia a partner resoluble, el acceso se niega (sin partner por defecto),
  nunca se concede acceso amplio.
- **Vinculación a más de un partner**: dado que un asesor pertenece a un único
  partner, una identidad que declare múltiples partners se trata como
  inconsistente y se rechaza (no se elige uno arbitrariamente).
- **Partner inexistente o desactivado**: si el partner del asesor no existe o
  está inactivo, el acceso se niega de forma segura con mensaje comprensible.
- **Identificador de partner suministrado por el cliente**: cualquier partner
  indicado por el cliente (URL/parámetro/cabecera/cuerpo) que difiera del de la
  sesión se ignora o se rechaza; el servidor nunca confía en él para ampliar el
  alcance.
- **Enumeración de recursos ajenos**: intentar adivinar identificadores de otros
  partners no permite distinguir "existe pero ajeno" de "no existe".
- **Cambio de pertenencia del asesor**: si la pertenencia cambia en la fuente de
  identidad, el nuevo alcance se aplica en la siguiente sesión, sin que persista
  un alcance obsoleto.
- **Sesión expirada durante la operación**: una operación con sesión expirada se
  trata como no autenticada, sin resolver partner ni exponer datos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST asociar a cada asesor exactamente un partner y
  derivar esa pertenencia del lado servidor a partir de su identidad autenticada,
  nunca de datos suministrados por el cliente.
- **FR-002**: El sistema MUST acotar toda la superficie que ve y opera un asesor
  (marca, contenido, rutas y datos) exclusivamente a su partner, sin ofrecer
  ningún mecanismo de interfaz para cambiar o seleccionar otro partner.
- **FR-003**: El sistema MUST re-verificar la pertenencia al partner del lado
  servidor en cada operación (lectura o mutación), de modo que la interfaz nunca
  sea la única frontera de aislamiento.
- **FR-004**: El sistema MUST rechazar toda operación que referencie un recurso o
  superficie de un partner distinto al del asesor, sin revelar datos del partner
  ajeno.
- **FR-005**: El sistema MUST ignorar cualquier identificador de partner
  suministrado por el cliente (URL, parámetro, cabecera o cuerpo) cuando difiera
  del partner derivado de la sesión, aplicando siempre el de la sesión.
- **FR-006**: El sistema MUST acotar automáticamente todas las lecturas
  colectivas (listados, búsquedas, agregaciones, conteos, exportaciones) al
  partner del asesor, sin depender de un filtro por partner enviado por el
  cliente.
- **FR-007**: El sistema MUST tratar el acceso a un recurso existente pero
  perteneciente a otro partner como indistinguible de "no encontrado", evitando
  confirmar la existencia de recursos ajenos.
- **FR-008**: El sistema MUST negar el acceso (sin partner por defecto) cuando la
  identidad del asesor no permita resolver un único partner válido (ausente,
  múltiple, inexistente o inactivo).
- **FR-009**: El sistema MUST responder con un rechazo de autorización ante una
  operación válida en sesión pero dirigida a un partner ajeno, y como no
  autenticado cuando no exista sesión válida.
- **FR-010**: El sistema MUST tomar la pertenencia al partner vigente al
  establecer la sesión y no conservar un alcance obsoleto si la pertenencia
  cambia en la fuente de identidad.
- **FR-011**: El sistema MUST dejar traza auditable de los intentos de acceso
  cruzado entre partners (quién, partner de origen, recurso/partner objetivo,
  cuándo), coherente con la auditoría del Back Office.

### Key Entities *(include if feature involves data)*

- **Asesor**: usuario operador del journey de venta. Atributo clave de este
  alcance: pertenencia a exactamente un partner, derivada de su identidad
  autenticada. No aporta el partner desde el cliente.
- **Pertenencia asesor–partner**: vínculo unívoco entre un asesor y su partner.
  Determina de forma exclusiva el alcance de superficie y datos del asesor.
- **Recurso acotado por partner**: cualquier entidad, vista o dato del journey
  que pertenece a un partner (por ejemplo, ventas/casos, clientes capturados,
  configuración de marca). Solo es accesible por asesores del mismo partner.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las sesiones de asesor resuelven un único partner del
  lado servidor; ninguna sesión opera sin partner resuelto.
- **SC-002**: El 100% de los intentos de acceso (lectura o mutación) a recursos
  de otro partner son rechazados sin exponer datos del partner ajeno.
- **SC-003**: El 0% de las lecturas colectivas realizadas por un asesor incluyen
  elementos, conteos o totales de otros partners, incluso sin filtro explícito.
- **SC-004**: El 100% de los identificadores de partner suministrados por el
  cliente que difieren del de la sesión son ignorados o rechazados, sin ampliar
  el alcance.
- **SC-005**: En el 100% de los casos de acceso a un recurso ajeno existente, la
  respuesta es indistinguible de "no encontrado" (no se confirma su existencia).
- **SC-006**: El 100% de las identidades sin un único partner válido (ausente,
  múltiple, inexistente o inactivo) resultan en denegación de acceso.
- **SC-007**: El 100% de los intentos de acceso cruzado quedan registrados de
  forma auditable.

## Assumptions

- El asesor se autentica mediante el flujo de identidad ya definido para la
  plataforma (SSO corporativo mediado por el BFF, PRD 04/06); esta especificación
  no redefine ese flujo, añade el aislamiento por partner sobre él.
- La pertenencia asesor→partner se obtiene de la identidad autenticada (por
  ejemplo, un claim del IdP) y se resuelve/valida del lado servidor, de forma
  coherente con cómo se derivan los roles en PRD 06. El modelo de datos concreto
  de la pertenencia se detalla en la fase de diseño.
- La resolución de tenant del front (PRD 01) es experiencia de usuario; la
  frontera de seguridad del aislamiento vive del lado servidor (BFF, PRD 04).
- El alcance cubre a los usuarios **asesores** que operan el journey; los
  administradores internos del Back Office y sus roles se gobiernan en PRD 06 y
  quedan fuera de esta especificación salvo por la traza de auditoría compartida.
- Un asesor pertenece a **exactamente un** partner; no se contempla en este
  alcance un asesor multi-partner.
- La auditoría de intentos de acceso cruzado se apoya en el registro de auditoría
  inmutable definido en PRD 06/07; esta especificación lo consume, no lo
  redefine.

## Dependencies

- **PRD 04 (Arquitectura BFF)**: superficie server-side donde se deriva la
  pertenencia al partner desde la sesión y se aplica el aislamiento efectivo.
- **PRD 06 (AuthZ, Roles y Auditoría)**: flujo de autenticación, patrón de
  derivación de atributos de identidad desde el IdP y registro de auditoría
  inmutable reutilizado para los intentos de acceso cruzado.
- **PRD 01 (Resolución de Tenant y Routing)**: resolución de partner en el front
  (experiencia), que este aislamiento respalda con la frontera server-side.
- **PRD 02 (Modelo de Partner y Contrato de Theme)**: catálogo de partners y su
  estado (activo/inactivo) usado para validar la pertenencia del asesor.
