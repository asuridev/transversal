# Feature Specification: AuthZ, Roles y Auditoría (Back Office)

**Feature Branch**: `006-authz-roles-auditoria`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "realiza las especificacion prds\06-authz-roles-y-auditoria.md ademas considera que para desarrollo se utilizara podman-compose para el servidor de autorizacion que sera un servidor sso76-openshift-rhel8:7.6 el mismo que se utilizrá en produccion"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acceso autenticado vía SSO corporativo (Priority: P1)

Un usuario interno abre el Back Office (`/admin`). Como no tiene sesión, es
redirigido al proveedor de identidad corporativo (IdP), se autentica con sus
credenciales corporativas y regresa al Back Office ya autenticado, sin que el
Back Office gestione contraseñas propias y sin que ningún token del IdP quede
expuesto en el navegador.

**Why this priority**: Es la puerta de entrada del Back Office; sin
autenticación segura ninguna otra funcionalidad puede operar. Constituye el MVP
mínimo demostrable (entrar y salir de forma segura).

**Independent Test**: Se puede probar por completo intentando acceder a `/admin`
sin sesión y verificando el ciclo redirección al IdP → autenticación → retorno
autenticado, e inspeccionando que el navegador solo conserva una cookie de
sesión httpOnly (ningún access/ID token del IdP visible en el cliente).

**Acceptance Scenarios**:

1. **Given** un usuario sin sesión, **When** navega a `/admin`, **Then** es
   redirigido al IdP corporativo para autenticarse.
2. **Given** un usuario que se autentica correctamente en el IdP, **When**
   regresa al Back Office, **Then** obtiene una sesión válida y accede a la
   superficie admin permitida por su rol.
3. **Given** una sesión establecida, **When** el usuario inspecciona el
   almacenamiento y el tráfico del navegador, **Then** solo existe una cookie de
   sesión httpOnly y en ningún momento aparece el access/ID token del IdP.
4. **Given** una sesión expirada o inválida, **When** el usuario realiza una
   acción admin, **Then** es tratado como no autenticado y reenviado al flujo de
   login.

---

### User Story 2 - Autorización por roles con menor privilegio (Priority: P1)

Los permisos del usuario se derivan de los roles que entrega el IdP y se mapean
a roles de la aplicación (`platform-admin`, `partner-editor`, `auditor`). Cada
ruta y cada acción sensible del Back Office se autoriza según el rol, aplicando
el principio de menor privilegio: sin un rol reconocido, no hay acceso.

**Why this priority**: La autorización es la frontera de seguridad efectiva del
Back Office; sin ella, la autenticación por sí sola no protege las operaciones
sensibles. Es imprescindible para el MVP junto con la autenticación.

**Independent Test**: Se puede probar asignando a un usuario cada rol y
verificando que ve exactamente las rutas/acciones permitidas y recibe rechazo
(403) en las no permitidas, y que un usuario sin rol reconocido no accede a nada.

**Acceptance Scenarios**:

1. **Given** un usuario con rol `auditor`, **When** consulta el listado de
   partners y la auditoría, **Then** los ve en modo solo lectura.
2. **Given** un usuario con rol `auditor`, **When** intenta publicar o desactivar
   un partner, **Then** la acción es rechazada con 403 y no produce ningún
   cambio.
3. **Given** un usuario con rol `partner-editor`, **When** crea, edita o publica
   branding de un partner, **Then** la operación se permite; **When** intenta
   gestionar el theme por defecto o a otros administradores, **Then** es
   rechazado.
4. **Given** un usuario autenticado sin ningún rol reconocido, **When** intenta
   acceder a cualquier superficie admin, **Then** recibe 403 (menor privilegio
   por defecto).
5. **Given** una acción sensible permitida en la interfaz, **When** se ejecuta,
   **Then** el permiso se vuelve a verificar del lado servidor antes de aplicar
   el cambio (la interfaz nunca es la única barrera).

---

### User Story 3 - Registro de auditoría inmutable de mutaciones (Priority: P2)

Toda mutación del Back Office (crear, editar, publicar, activar, desactivar
partner o theme) queda registrada de forma inmutable, indicando quién la hizo,
qué cambió, cuándo, con el detalle concreto de los cambios (diff) y, cuando
aplique, la versión de theme resultante.

**Why this priority**: Habilita la trazabilidad y el cierre de compliance del
Back Office. Depende de que existan operaciones autenticadas y autorizadas (US1
y US2), por lo que se prioriza después de ellas.

**Independent Test**: Se puede probar ejecutando cada tipo de mutación y
verificando que se crea exactamente una entrada de auditoría con actor, acción,
fecha, diff y versión correctos, y que dicha entrada no puede modificarse ni
eliminarse.

**Acceptance Scenarios**:

1. **Given** un usuario autorizado, **When** publica un cambio de branding,
   **Then** se crea una entrada de auditoría con el diff exacto de los campos
   cambiados y la versión de theme resultante.
2. **Given** una entrada de auditoría existente, **When** cualquier actor intenta
   editarla o borrarla, **Then** la operación es imposible (registro de solo
   anexado).
3. **Given** una mutación que falla o se revierte, **When** finaliza la
   operación, **Then** no queda una entrada de auditoría inconsistente (el
   registro se realiza en la misma unidad transaccional que la mutación).
4. **Given** una entrada de auditoría, **When** se consulta, **Then** contiene la
   identidad del actor tanto técnica (identificador del IdP) como legible
   (nombre para lectura humana).

---

### User Story 4 - Consulta de auditoría con filtros (Priority: P3)

Un usuario con rol `auditor` o `platform-admin` puede consultar la auditoría
desde el Back Office, filtrando por partner, por actor y por rango de fechas,
pudiendo reconstruir el estado de marca vigente en una fecha dada gracias al
enlace con el versionado de theme.

**Why this priority**: Aporta el valor de compliance de cara al usuario, pero
requiere que el registro de auditoría (US3) ya exista. Es la última capa de la
funcionalidad.

**Independent Test**: Se puede probar poblando entradas de auditoría y
verificando que los filtros por partner, actor y rango de fechas devuelven
exactamente el subconjunto esperado y que las versiones de theme permiten
reconstruir el estado vigente en una fecha.

**Acceptance Scenarios**:

1. **Given** un usuario con rol `auditor`, **When** consulta la auditoría con un
   filtro por partner, **Then** obtiene solo las entradas de ese partner.
2. **Given** un conjunto de entradas de varios actores y fechas, **When** se
   filtra por actor y por rango de fechas, **Then** el resultado contiene
   únicamente las entradas que cumplen ambos criterios.
3. **Given** un usuario sin rol de lectura de auditoría, **When** intenta
   consultar la auditoría, **Then** recibe 403.
4. **Given** el historial de publicaciones con sus versiones, **When** se elige
   una fecha, **Then** es posible determinar la versión de marca vigente en esa
   fecha.

---

### Edge Cases

- **Claim de rol ausente o desconocido**: si el IdP no entrega roles o entrega
  uno no mapeado, el usuario queda sin acceso (403), nunca con acceso por
  defecto.
- **Claim de rol manipulado**: un token con firma inválida o audiencia/emisor
  incorrectos se rechaza; el mapeo claim→rol se resuelve del lado servidor.
- **Sesión robada (XSS)**: al no exponerse el token en el cliente y usar cookie
  httpOnly + SameSite estricto, un script inyectado no puede leer ni reutilizar
  el token del IdP.
- **CSRF en mutaciones**: una petición de mutación forjada desde otro origen se
  rechaza mediante protección anti-CSRF, aun con cookie de sesión presente.
- **Cambio de roles en RRHH/IdP**: los roles se toman del IdP en cada inicio de
  sesión; no se conserva una caché larga de permisos que quede desincronizada.
- **Expiración de sesión durante una operación**: una mutación iniciada con
  sesión expirada se rechaza (401) sin aplicar cambios ni registrar auditoría.
- **Concurrencia**: dos publicaciones simultáneas sobre el mismo partner generan
  versiones y entradas de auditoría coherentes sin sobrescribirse silenciosamente.
- **Entorno del IdP no disponible**: si el servidor de autorización no responde,
  el acceso a `/admin` falla de forma segura (sin conceder acceso) y con mensaje
  comprensible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST autenticar a los usuarios internos del Back Office
  contra el proveedor de identidad corporativo mediante SSO, sin gestionar
  usuarios ni contraseñas propias.
- **FR-002**: El sistema MUST mantener la autenticación de forma que el
  access/ID token del IdP nunca sea accesible desde el navegador; el cliente solo
  MUST operar con una cookie de sesión httpOnly emitida del lado servidor.
- **FR-003**: El sistema MUST validar del lado servidor la autenticidad del token
  del IdP (firma, expiración, audiencia/emisor) antes de establecer una sesión.
- **FR-004**: El sistema MUST derivar los roles de la aplicación a partir de los
  claims de rol del IdP mediante un mapeo centralizado y configurable (no
  embebido en código), aplicando menor privilegio: sin rol reconocido, sin acceso.
- **FR-005**: El sistema MUST soportar al menos los roles `platform-admin`,
  `partner-editor` y `auditor`, con los permisos descritos en la sección de
  roles.
- **FR-006**: El sistema MUST proteger las rutas administrativas en la interfaz
  (sesión válida y luego rol suficiente) y MUST re-verificar sesión y rol del
  lado servidor en cada operación administrativa; la interfaz NUNCA es la única
  frontera de seguridad.
- **FR-007**: El sistema MUST responder 401 ante una operación administrativa sin
  sesión válida y 403 ante una sesión válida con rol insuficiente.
- **FR-008**: El sistema MUST registrar toda mutación del Back Office como una
  entrada de auditoría que incluya entidad, identificador de entidad, acción,
  actor (identificador técnico y nombre legible), fecha, diff de los cambios y,
  cuando aplique, la versión de theme resultante.
- **FR-009**: El sistema MUST garantizar que las entradas de auditoría sean
  inmutables (solo anexado): no se pueden actualizar ni eliminar.
- **FR-010**: El sistema MUST registrar la entrada de auditoría en la misma
  unidad transaccional que la mutación, de modo que no existan mutaciones sin
  auditoría ni entradas de auditoría sin mutación efectiva.
- **FR-011**: El sistema MUST permitir consultar la auditoría a los roles
  `auditor` y `platform-admin`, con filtros por partner, por actor y por rango de
  fechas.
- **FR-012**: El sistema MUST vincular las entradas de auditoría al versionado de
  theme de forma que se pueda reconstruir el estado de marca vigente en una fecha
  determinada.
- **FR-013**: El sistema MUST proteger las mutaciones administrativas frente a
  CSRF, incluso en presencia de una cookie de sesión válida.
- **FR-014**: El sistema MUST tomar los roles del IdP en cada inicio de sesión,
  sin conservar una caché de permisos de larga duración que pueda quedar
  desincronizada del IdP.

### Key Entities *(include if feature involves data)*

- **Sesión de usuario**: representa la sesión autenticada de un usuario interno.
  Atributos clave: identidad del usuario (identificador del IdP y nombre
  legible), rol(es) de aplicación vigentes, estado de validez/expiración. No
  contiene el token del IdP en el cliente.
- **Rol de aplicación**: conjunto de permisos que gobierna el acceso a rutas y
  acciones. Valores: `platform-admin`, `partner-editor`, `auditor`. Se deriva de
  los claims del IdP mediante un mapeo configurable.
- **Entrada de auditoría**: registro inmutable de una mutación. Atributos:
  identificador, entidad (`partner` | `partner_theme`), identificador de entidad,
  acción (`create` | `update` | `publish` | `deactivate` | `activate`), actor
  (identificador técnico y nombre legible), fecha (ISO-8601), diff de cambios
  (campo → {antes, después}) y versión de theme resultante cuando aplica.
  Relacionada con Partner y con el versionado de theme.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los accesos a la superficie administrativa sin sesión
  válida son redirigidos al IdP y, tras autenticarse, retornan autenticados.
- **SC-002**: En el 100% de las sesiones, ninguna inspección del navegador
  (almacenamiento o tráfico) revela el access/ID token del IdP; solo se observa
  la cookie de sesión httpOnly.
- **SC-003**: El 100% de los intentos de una acción sensible por un usuario sin
  el rol requerido son rechazados (403) sin producir cambios.
- **SC-004**: El 100% de las operaciones administrativas sin sesión válida son
  rechazadas (401) del lado servidor.
- **SC-005**: El 100% de las mutaciones ejecutadas generan exactamente una
  entrada de auditoría con actor, acción, fecha, diff y versión correctos.
- **SC-006**: El 100% de los intentos de modificar o eliminar una entrada de
  auditoría fracasan (inmutabilidad verificable).
- **SC-007**: Las consultas de auditoría con filtros por partner, actor y rango
  de fechas devuelven exactamente el subconjunto correcto en el 100% de los casos
  de prueba.
- **SC-008**: Para cualquier fecha consultada, es posible determinar de forma
  unívoca la versión de marca vigente de un partner en esa fecha.

## Assumptions

- El proveedor de identidad corporativo es un servidor **RH-SSO 7.6**
  (`sso76-openshift-rhel8:7.6`), y se usa **el mismo producto y versión tanto en
  desarrollo como en producción**; en desarrollo se levanta localmente mediante
  **podman-compose**. Esto se documenta como dependencia de entorno; los
  requisitos funcionales permanecen agnósticos del producto concreto.
- El flujo de autenticación es **OIDC Authorization Code + PKCE mediado por el
  BFF** (coherente con PRD 04); la mediación server-side y el secreto de cliente
  en el gestor de secretos son parte del diseño heredado de PRD 04.
- Los roles llegan como **claim del IdP** (p. ej. `roles: ["partner-admin"]`) y
  se mapean a los roles de la aplicación mediante configuración del BFF.
- La persistencia de la auditoría se apoya en el `audit_log` y el versionado de
  theme definidos en **PRD 02**; esta especificación no redefine ese modelo, lo
  consume.
- Los guards del front (`authGuard` → `roleGuard(...)`) son experiencia de
  usuario, no la frontera de seguridad; la autorización efectiva vive en el BFF
  (PRD 04).
- El alcance cubre exclusivamente usuarios **internos** del Back Office; los
  usuarios finales del portal público quedan fuera de esta especificación.

## Dependencies

- **PRD 04 (Arquitectura BFF)**: valida el token y media el flujo OIDC; superficie
  server-side donde se aplica la autorización efectiva y la protección CSRF.
- **PRD 05 (Back Office — Gestión de Partners)**: superficie a proteger y a
  auditar (rutas y acciones administrativas).
- **PRD 02 (Modelo de Partner y Contrato de Theme)**: versionado de theme y
  `audit_log` que alimentan la auditoría.
- **Servidor de autorización RH-SSO 7.6** (`sso76-openshift-rhel8:7.6`),
  provisionado vía podman-compose en desarrollo y equivalente en producción.
