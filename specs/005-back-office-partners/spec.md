# Feature Specification: Back Office — Gestión de Partners

**Feature Branch**: `005-back-office-partners`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "back office gestion-de-partners realiza las especificaciones para este prd prds\05-back-office-gestion-de-partners.md — NO cuento con un diseño para el panel administrador; tomar el Figma 'Portal Médicos Cardif' como guía de estilo."

## User Scenarios & Testing *(mandatory)*

Este panel es una herramienta **interna**: los actores son operadores internos
(rol `admin`) que dan de alta y mantienen la marca de cada partner (banco). El
resultado de su trabajo lo consume el cliente final en la experiencia pública,
pero el cliente final nunca ve este panel.

### User Story 1 - Ver y encontrar partners (Priority: P1)

Como operador interno, quiero ver un listado de todos los partners con su estado
y poder buscarlos por nombre o slug, para localizar rápidamente el que necesito
gestionar y entender de un vistazo cuáles están activos.

**Why this priority**: Es la puerta de entrada del panel. Sin un listado
navegable no hay forma de llegar a ninguna otra acción (editar, previsualizar,
activar). Entrega valor por sí sola como inventario consultable de partners.

**Independent Test**: Con partners ya existentes en el sistema, se abre el panel
y se verifica que la lista muestra nombre, slug, estado, versión de theme
vigente y última modificación; al escribir en el buscador la lista se filtra a
las coincidencias por nombre o slug.

**Acceptance Scenarios**:

1. **Given** existen varios partners registrados, **When** el operador abre el
   listado, **Then** ve cada partner con su `displayName`, `slug`, estado
   (activo/inactivo), versión de theme vigente, fecha de última modificación y
   autor del último cambio.
2. **Given** el listado está cargado, **When** el operador escribe "popular" en
   el buscador, **Then** la lista se reduce a los partners cuyo nombre o slug
   coincide, sin recargar la página.
3. **Given** un usuario sin rol `admin` intenta acceder a la ruta del panel,
   **When** se resuelve la navegación, **Then** el acceso es denegado y no se
   muestra ningún dato de partners.

---

### User Story 2 - Dar de alta un partner (Priority: P1)

Como operador interno, quiero crear un nuevo partner indicando su slug y nombre,
para incorporar un banco al sistema partiendo de una marca base que luego
ajustaré.

**Why this priority**: Es el acto fundacional del ciclo de vida de un partner;
sin alta no hay nada que editar ni publicar. Junto con US1 constituye el MVP
que permite incorporar partners al inventario.

**Independent Test**: Se completa el formulario de alta con un slug válido y un
nombre, se envía, y se verifica que aparece un nuevo partner en estado inactivo
con una versión de theme v1 en borrador partiendo de la marca por defecto.

**Acceptance Scenarios**:

1. **Given** el operador abre el formulario de alta, **When** ingresa el slug
   `popular` y el nombre "Banco Popular" y confirma, **Then** se crea el partner
   en estado **inactivo** con un theme **v1 en borrador** basado en la plantilla
   por defecto.
2. **Given** el operador ingresa un slug con formato inválido (mayúsculas,
   espacios o caracteres no permitidos), **When** intenta continuar, **Then** el
   formulario lo rechaza y explica la regla de formato incumplida.
3. **Given** el operador ingresa un slug reservado (p. ej. `admin` o `api`),
   **When** intenta continuar, **Then** el sistema lo rechaza indicando que es
   un slug reservado.
4. **Given** el operador ingresa un slug ya usado por otro partner, **When**
   intenta confirmar, **Then** el sistema rechaza el alta por unicidad.
5. **Given** el operador deja vacío el nombre, **When** intenta continuar,
   **Then** el formulario marca el nombre como requerido.

---

### User Story 3 - Editar la marca con preview en vivo (Priority: P2)

Como operador interno, quiero editar los colores, logos, tipografía y textos
legales de un partner y ver el resultado reflejado al instante en una pantalla
real de la experiencia, para ajustar la marca con confianza antes de publicarla.

**Why this priority**: Es la pieza de mayor valor diferencial del panel — la
razón por la que existe una herramienta visual y no una edición de base de
datos. Depende de que exista el partner (US2), por eso es P2.

**Independent Test**: Sobre un partner existente, se abre el editor, se cambia
el color primario y se verifica que el lienzo de preview refleja el cambio
inmediatamente sin guardar ni publicar; se verifica también que el preview no
altera la apariencia del propio panel de administración.

**Acceptance Scenarios**:

1. **Given** el operador está en el editor de un partner, **When** cambia el
   color primario, **Then** el preview en vivo se actualiza al instante sin
   necesidad de guardar ni publicar.
2. **Given** el operador elige un color de texto con contraste insuficiente
   contra su superficie, **When** el color se aplica, **Then** el editor
   **advierte** que no cumple el contraste AA (sin bloquear la edición).
3. **Given** el operador sube un logo, **When** el archivo no cumple los límites
   de tipo, tamaño o dimensiones, **Then** el editor rechaza la subida y explica
   el motivo.
4. **Given** el operador tiene cambios en el editor, **When** observa el panel
   de administración alrededor del preview, **Then** el estilo del panel
   permanece intacto (el preview está aislado y no "ensucia" el back office).
5. **Given** el operador guarda sus cambios, **When** la operación concluye,
   **Then** se registra una **nueva versión en borrador** sin afectar la versión
   vigente que ve el cliente.

---

### User Story 4 - Publicar una versión de theme (Priority: P2)

Como operador interno, quiero publicar la versión en borrador de un partner,
para que los cambios de marca pasen a ser la experiencia vigente que ve el
cliente final, sin necesidad de un redespliegue.

**Why this priority**: Es el paso que convierte el trabajo de edición en valor
para el cliente. Depende de que exista una versión en borrador (US3).

**Independent Test**: Sobre un partner con una versión en borrador, se pulsa
publicar y se verifica que la experiencia pública del partner refleja el cambio
sin redeploy, y que la versión pasa de borrador a vigente.

**Acceptance Scenarios**:

1. **Given** un partner tiene una versión de theme en borrador, **When** el
   operador la publica, **Then** esa versión pasa a ser la **vigente** y la
   experiencia pública del partner refleja el cambio sin redespliegue.
2. **Given** una versión recién publicada, **When** el cliente accede a la ruta
   pública del partner, **Then** ve la nueva marca (la caché anterior queda
   invalidada).
3. **Given** un partner sin cambios en borrador, **When** el operador consulta
   la acción de publicar, **Then** no hay nada nuevo que publicar y la acción lo
   refleja.

---

### User Story 5 - Activar / desactivar un partner (Priority: P3)

Como operador interno, quiero desactivar un partner (baja lógica) y volver a
activarlo, para retirarlo o reincorporarlo a la experiencia sin perder su
historial ni borrar datos.

**Why this priority**: Gestión del ciclo de vida importante pero no bloqueante
para el MVP; el valor principal ya se entrega con alta, edición y publicación.

**Independent Test**: Sobre un partner activo, se desactiva y se verifica que
deja de servirse en la experiencia pública (fallback) pero sigue apareciendo en
el listado con su historial; luego se reactiva y vuelve a servirse.

**Acceptance Scenarios**:

1. **Given** un partner activo, **When** el operador lo desactiva, **Then** su
   estado pasa a **inactivo**, deja de servirse en la experiencia pública y
   conserva íntegro su historial y versiones.
2. **Given** un partner inactivo, **When** el operador lo reactiva, **Then**
   vuelve a estar disponible en la experiencia pública.
3. **Given** cualquier acción de activación/desactivación, **When** se ejecuta,
   **Then** en ningún caso se produce un borrado físico del partner ni de sus
   versiones.

---

### Edge Cases

- **Carrera de dos operadores** creando el mismo slug simultáneamente: la
  unicidad debe garantizarse de forma que solo uno tenga éxito y el otro reciba
  un rechazo claro por duplicado.
- **Publicar mientras otro operador edita** el mismo partner: debe quedar claro
  qué versión queda vigente y no perderse cambios de forma silenciosa.
- **Subida de un SVG malicioso** como logo: el archivo debe sanitizarse; no debe
  poder inyectar contenido ejecutable en la experiencia ni en el panel.
- **Color primario igual a la superficie** (contraste nulo): el editor debe
  advertir, no dejar publicar "a ciegas" una marca ilegible.
- **Partner sin theme vigente** (solo borrador) que se intenta activar: definir
  el comportamiento esperado (no debería servirse una experiencia sin versión
  publicada).
- **Búsqueda sin resultados**: el listado debe comunicar el estado vacío en
  lugar de parecer un error.
- **Pérdida de conexión al guardar/publicar**: el operador debe recibir un error
  comprensible y no quedar con un estado ambiguo sobre si el cambio se aplicó.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrar un listado de partners con, por cada uno,
  nombre visible, slug, estado (activo/inactivo), versión de theme vigente,
  fecha de última modificación y autor del último cambio.
- **FR-002**: El sistema MUST permitir buscar/filtrar el listado por nombre o
  por slug.
- **FR-003**: El sistema MUST restringir todo el panel al rol interno `admin`;
  cualquier usuario sin ese rol MUST ser denegado antes de ver datos.
- **FR-004**: El sistema MUST permitir crear un partner indicando slug y nombre
  visible.
- **FR-005**: El sistema MUST validar el slug contra las reglas de formato
  definidas para slugs de partner, contra la lista de **slugs reservados**, y
  contra la **unicidad** entre partners existentes; un slug inválido, reservado
  o duplicado MUST ser rechazado con un motivo claro.
- **FR-006**: Al crear un partner, el sistema MUST generar una versión de theme
  **v1 en borrador** basada en la marca por defecto, y el partner MUST nacer en
  estado **inactivo**.
- **FR-007**: El sistema MUST ofrecer un editor visual de marca que permita
  editar colores, assets (logo de header, favicon, logo del banco co-brand, logo
  de grupo), tipografía y textos legales (disclaimer, URL de términos, URL de
  privacidad).
- **FR-008**: El editor MUST advertir cuando un color elegido no cumple el
  contraste mínimo AA respecto a su superficie, sin bloquear necesariamente la
  edición.
- **FR-009**: El sistema MUST validar los assets subidos (tipo, tamaño,
  dimensiones y sanitización de SVG) tanto al momento de la carga como del lado
  del servidor antes de aceptarlos.
- **FR-010**: El sistema MUST ofrecer un **preview en vivo** que aplique la
  configuración en edición sobre una **pantalla real de la experiencia** y que
  se actualice inmediatamente ante cada cambio, sin guardar ni publicar.
- **FR-011**: El preview MUST estar **aislado** de forma que no altere la
  apariencia del propio panel de administración.
- **FR-012**: El preview MUST usar los mismos componentes de presentación que la
  experiencia real, de modo que lo previsualizado coincida con lo que verá el
  cliente.
- **FR-013**: Al guardar, el sistema MUST crear una **nueva versión en borrador**
  sin afectar la versión vigente.
- **FR-014**: El sistema MUST permitir **publicar** una versión en borrador, tras
  lo cual esa versión pasa a ser la vigente y la experiencia pública del partner
  refleja el cambio **sin redespliegue**, invalidando la caché anterior.
- **FR-015**: El sistema MUST permitir **desactivar** un partner como baja lógica
  (estado `inactive`) y **reactivarlo**, sin realizar en ningún caso un borrado
  físico.
- **FR-016**: Un partner inactivo MUST dejar de servirse en la experiencia
  pública, conservando íntegro su historial y sus versiones.
- **FR-017**: Toda mutación (alta, edición, publicación, activación/desactivación)
  MUST registrar el **actor** y el **timestamp** para auditoría.
- **FR-018**: El sistema MUST garantizar la unicidad del slug incluso ante dos
  altas concurrentes del mismo slug, de modo que solo una tenga éxito.

### Key Entities *(include if feature involves data)*

- **Partner**: Representa a un banco/aliado incorporado al sistema. Atributos
  clave: identificador, slug (único, inmutable tras el alta), nombre visible,
  estado (activo/inactivo), referencia a la versión de theme vigente, y metadatos
  de auditoría (última modificación, autor). Nunca se borra físicamente.
- **Versión de theme del partner (PartnerTheme)**: Representa una configuración
  de marca versionada de un partner. Atributos clave: número de versión, estado
  (borrador/publicado), colores, assets (logos, favicon), tipografía y textos
  legales. Un partner tiene una versión vigente (publicada) y puede tener una en
  borrador en curso; el historial de versiones se conserva.
- **Asset de marca**: Archivo gráfico asociado a una versión de theme (logo de
  header, favicon, logo del banco, logo de grupo). Se aloja en almacenamiento de
  objetos a través del back office, nunca exponiendo credenciales del bucket al
  cliente. Sujeto a validación de tipo, tamaño, dimensiones y sanitización.
- **Registro de auditoría**: Traza de cada mutación con actor y timestamp. El
  detalle y la propiedad de este registro corresponden a la feature de AuthZ y
  auditoría; aquí solo se garantiza que cada mutación lo alimenta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede dar de alta un partner nuevo (desde abrir el
  formulario hasta tener el partner creado en borrador) en menos de 2 minutos.
- **SC-002**: Un cambio de color en el editor se refleja en el preview en vivo en
  menos de 1 segundo (percibido como instantáneo), sin guardar ni publicar.
- **SC-003**: El 100% de los intentos de crear un partner con slug inválido,
  reservado o duplicado son rechazados con un mensaje que indica el motivo.
- **SC-004**: Tras publicar una versión, la experiencia pública del partner
  refleja el cambio sin ningún redespliegue de la aplicación.
- **SC-005**: El 100% de las mutaciones quedan registradas con actor y timestamp
  verificables.
- **SC-006**: Ningún partner ni versión de theme se elimina físicamente como
  resultado de una desactivación; el historial permanece consultable al 100%.
- **SC-007**: El editor advierte en el 100% de los casos en que un color no
  cumple contraste AA respecto a su superficie.
- **SC-008**: El bundle entregado al cliente no expone en ningún caso las
  credenciales del almacenamiento de objetos donde se alojan los assets.
- **SC-009**: Editar la marca de un partner nunca altera la apariencia del propio
  panel de administración (el preview permanece aislado en el 100% de los casos).

## Assumptions

- **Autorización delegada**: La autenticación, la definición del rol `admin` y el
  registro/consulta detallado de auditoría son propiedad de la feature de AuthZ y
  auditoría (PRD 06). Esta feature asume su existencia: aplica el guard de rol y
  alimenta la auditoría, pero no gestiona usuarios ni roles del IdP.
- **Contratos de datos**: El modelo de `Partner` y el contrato de `PartnerTheme`
  (colores, assets, tipografía, legales, versionado borrador/publicado) provienen
  del PRD 02; esta feature los edita, no los redefine.
- **Motor de theming y anti-FOUC**: El preview en vivo y la invalidación de caché
  al publicar reutilizan el motor de theming del PRD 03; esta feature no crea un
  motor nuevo.
- **Backend/BFF**: Todas las operaciones (listar, crear, editar, publicar,
  activar/desactivar, subir assets) se realizan contra los endpoints de
  administración del BFF (PRD 04); el panel no accede a base de datos ni a
  almacenamiento de objetos directamente.
- **Reglas de slug**: El formato de slug (kebab-case, longitud) y la lista de
  slugs reservados provienen de las reglas de partner ya definidas (PRD 01); esta
  feature las aplica.
- **Diseño visual del panel**: El panel de administración **no existe en Figma**
  y se diseña desde cero en esta feature. El Figma "Portal Médicos Cardif"
  aportado se usa únicamente como **guía de estilo** (paleta, tipografía, tono
  visual) y como fuente de la pantalla de journey usada como lienzo de preview
  (p. ej. "Ofrecimiento del seguro / Personaliza tu seguro"). No se copia una
  pantalla de administración desde Figma porque no la hay.
- **Alcance de edición**: El panel edita marca (branding), no el journey ni la
  lógica del seguro; el alta de partners la realiza un operador interno, no hay
  auto-registro externo de bancos.
- **Fuera de alcance v1**: Gestión de usuarios/roles del IdP, edición del journey
  o de la lógica del producto, y el auto-registro externo de partners.
