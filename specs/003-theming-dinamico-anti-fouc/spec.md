# Feature Specification: Theming Dinámico y Anti-FOUC

**Feature Branch**: `003-theming-dinamico-anti-fouc`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "theming dinamico anti-fouc desarrolla la especificacion con relacion al prd prds/03-theming-dinamico-y-anti-fouc.md"

## User Scenarios & Testing *(mandatory)*

<!--
  Esta feature consume el contrato público de theme (feature 002) y el
  `partnerSlug` resuelto por el ruteo de tenant (feature 001). Aquí se especifica
  CÓMO la experiencia del usuario final aplica ese branding sin parpadeo.
-->

### User Story 1 - Primer paint ya con la marca del partner (sin FOUC) (Priority: P1)

Un usuario final abre una URL de journey de un partner (p. ej.
`app.com/popular/oferta`). Desde el **primer instante en que ve la pantalla**,
la experiencia ya trae los colores, el logo, el favicon y el título del banco
correspondiente (Banco Popular). En ningún momento aparece un flash con la marca
neutra/por defecto que luego "salta" a la marca del banco.

**Why this priority**: Es el objetivo central de la feature y el criterio duro
del producto (**FOUC = 0**). Sin él, la experiencia parece rota o poco confiable
para el banco distribuidor: la percepción de marca se daña en el primer segundo.
Es la pieza que justifica que el branding se resuelva antes de pintar, no
después.

**Independent Test**: Se puede probar cargando la URL de un partner con branding
publicado y verificando —mediante auditoría visual del primer render frente a la
versión ya interactiva— que **no** existe un cambio observable de marca (colores,
logo, favicon, título) entre el contenido inicial entregado y la experiencia ya
activa.

**Acceptance Scenarios**:

1. **Given** un partner activo con branding publicado y su `slug` en la URL,
   **When** el usuario carga la página por primera vez, **Then** el primer
   contenido visible ya presenta los colores, el logo, el favicon y el título del
   partner, sin flash de marca por defecto.
2. **Given** la carga inicial ya renderizada con la marca del partner, **When** la
   experiencia se vuelve interactiva, **Then** **no** ocurre ningún reajuste
   visible de colores, logo, favicon ni título (la marca es idéntica antes y
   después de volverse interactiva).
3. **Given** un partner cuya tipografía de marca es una fuente custom, **When** la
   página carga, **Then** el texto **no** bloquea el render y la fuente de marca
   se aplica sin provocar un salto de estilos perceptible.

---

### User Story 2 - Toda la experiencia refleja el branding del partner (Priority: P1)

Mientras el usuario recorre el journey de un partner, **todos** los elementos de
identidad reflejan de forma consistente la marca del banco activo: paleta de
colores en la interfaz, logos (producto y co-branded del banco), favicon, título
de la pestaña, footer co-branded y textos legales (disclaimer y enlaces). Ningún
elemento muestra la marca de otro partner ni valores neutros por defecto cuando
hay un partner activo.

**Why this priority**: El anti-FOUC (US1) resuelve el **primer** paint; esta
historia garantiza que la marca sea **completa y coherente** en toda la
superficie visible. Ambas son P1 porque una experiencia sin flash pero con
elementos sin marcar (o con logo genérico) tampoco cumple el objetivo de
co-branding con el banco.

**Independent Test**: Se puede probar recorriendo la experiencia de un partner y
verificando que cada elemento de identidad (colores, ambos logos, favicon,
título, footer y textos legales) corresponde exactamente a los valores del theme
publicado de ese partner, y que ningún elemento queda con valores por defecto.

**Acceptance Scenarios**:

1. **Given** un partner activo con branding publicado, **When** el usuario ve
   cualquier pantalla del journey, **Then** los colores de la interfaz, el logo,
   el favicon y el título corresponden al theme de ese partner.
2. **Given** el theme de un partner con footer co-branded y textos legales,
   **When** el usuario alcanza esas zonas de la experiencia, **Then** se muestran
   el footer co-branded y el disclaimer/enlaces legales de ese partner.
3. **Given** dos partners con identidad visual opuesta (p. ej. **Banco Popular**,
   marca verde, y **Banco Occidente**, marca azul), **When** se cargan sus
   respectivas URLs, **Then** cada experiencia refleja íntegramente su propia
   marca, sin mezclar valores entre partners.
4. **Given** un componente reutilizable de interfaz, **When** cambia el partner
   activo, **Then** su apariencia cambia **solo** por los valores de marca
   aplicados, sin requerir variantes de marca embebidas en el propio componente.

---

### User Story 3 - Navegación dentro del journey sin volver a pedir el branding (Priority: P1)

Una vez cargada la experiencia de un partner, el usuario avanza entre pasos del
journey (p. ej. de la oferta al formulario, del formulario a la confirmación).
Al cambiar de paso, la experiencia **no** vuelve a solicitar el branding del
partner: la marca ya resuelta se reutiliza de forma instantánea, sin parpadeo ni
demora atribuibles a re-resolver el theme.

**Why this priority**: La eficiencia de caché es parte del contrato del producto
(la navegación no debe re-pedir el theme) y sostiene tanto la fluidez como la
ausencia de parpadeos intermedios. Es P1 porque un re-fetch por paso reintroduce
latencia y riesgo de FOUC en cada transición, degradando el objetivo central.

**Independent Test**: Se puede probar cargando un partner, navegando entre varios
pasos del journey y verificando que, tras la primera resolución, **no** se
originan nuevas solicitudes de branding para ese partner durante la navegación.

**Acceptance Scenarios**:

1. **Given** la experiencia de un partner ya cargada y su branding resuelto,
   **When** el usuario navega a otro paso del mismo journey, **Then** **no** se
   dispara una nueva solicitud de branding y la marca permanece sin parpadeo.
2. **Given** una navegación entre pasos, **When** ocurre la transición, **Then**
   la marca (colores, logo, favicon, título) se mantiene estable, sin volver
   momentáneamente a valores por defecto.

---

### User Story 4 - Un cambio publicado se refleja sin redeploy (Priority: P2)

Un administrador publica un cambio de branding de un partner (p. ej. un color)
desde la herramienta de administración. Tras la publicación, las nuevas visitas a
la experiencia de ese partner reflejan el cambio **sin** necesidad de un nuevo
despliegue de la aplicación, dentro de una ventana acotada de propagación de
caché.

**Why this priority**: Habilita la operación autónoma del branding (sin ciclo de
desarrollo) y valida que la caché no "congele" un theme viejo. Es P2 porque el
valor central (anti-FOUC y branding correcto) se entrega aun antes de optimizar
el ciclo de actualización, pero es necesaria para la operación real.

**Independent Test**: Se puede probar publicando un cambio de branding para un
partner y verificando que una visita posterior (una vez propagada la
invalidación) muestra el nuevo valor, sin redeploy de la aplicación.

**Acceptance Scenarios**:

1. **Given** un partner con branding publicado y ya en uso, **When** se publica
   una versión nueva de su theme, **Then** las visitas posteriores —tras la
   ventana de propagación— muestran el branding nuevo sin redeploy.
2. **Given** un cambio recién publicado, **When** una experiencia ya cargada en un
   cliente sigue activa, **Then** la actualización no corrompe la sesión en curso;
   el nuevo branding aplica en la siguiente resolución del theme.

---

### User Story 5 - Fallback a theme por defecto sin parpadeo (Priority: P2)

Un usuario abre una URL cuyo `slug` no corresponde a ningún partner servible
(inexistente, partner inactivo, o raíz sin partner). La experiencia se presenta
con el **theme por defecto neutro de plataforma**, también **sin parpadeo**: el
primer paint ya trae la marca por defecto, sin flash ni salto posterior, y sin
revelar si un partner existe o no.

**Why this priority**: Es la red de seguridad visual: garantiza que la experiencia
nunca quede sin identidad ni con un parpadeo en el caso de fallback. Es P2 porque
depende de que el motor de theming (US1–US2) exista, y complementa el objetivo
anti-FOUC extendiéndolo al caso por defecto.

**Independent Test**: Se puede probar cargando una URL con `slug` no servible y
verificando que el primer paint ya trae el theme por defecto neutro, sin flash ni
reajuste posterior, e indistinguible entre los distintos motivos de fallback.

**Acceptance Scenarios**:

1. **Given** un `slug` inexistente o de un partner no servible, **When** el usuario
   carga la página, **Then** el primer paint ya presenta el theme por defecto
   neutro, sin flash de otra marca ni reajuste posterior.
2. **Given** distintos motivos de fallback (slug desconocido, partner inactivo,
   raíz), **When** se resuelve el branding, **Then** el resultado visual es el
   mismo theme por defecto, sin pistas sobre la existencia de partners.

---

### Edge Cases

- **Fuente de marca que tarda en cargar**: la tipografía custom no debe bloquear
  el render ni producir un salto de estilos perceptible; hay un comportamiento de
  sustitución tipográfica mientras la fuente termina de cargar.
- **Desalineación entre el branding del contenido inicial y el de la experiencia
  ya interactiva**: ambos deben derivar del **mismo** branding resuelto, de modo
  que no exista discrepancia entre lo primero que se pinta y lo que queda tras
  volverse interactiva.
- **Caché sirviendo un theme viejo tras publicar**: una publicación debe
  reflejarse tras la ventana de propagación; no debe quedar "congelado" un theme
  anterior de forma indefinida.
- **Slug que deja de ser servible entre visitas** (partner desactivado): una
  visita posterior debe caer al theme por defecto sin parpadeo, no quedar con el
  branding anterior.
- **Asset de marca (logo/favicon/fuente) que no carga**: la ausencia de un binario
  no debe romper la aplicación del resto del branding ni provocar un parpadeo del
  conjunto.
- **Primera visita sin branding en caché**: el primer paint debe traer la marca
  correcta igualmente (la marca se resuelve antes de pintar, no depende de una
  caché previamente poblada).
- **Contraste insuficiente de los colores de un banco**: la garantía de contraste
  accesible es responsabilidad del editor de branding (feature de administración);
  esta feature aplica fielmente los valores publicados, no los corrige.

## Requirements *(mandatory)*

### Functional Requirements

#### Aplicación del branding

- **FR-001**: El sistema DEBE aplicar el branding del partner activo (colores,
  logo, favicon, título de pestaña, footer co-branded, textos legales y
  tipografía) a partir de la **proyección pública** del theme publicado (contrato
  definido en la feature `002-modelo-partner-theme`).
- **FR-002**: Los **colores** del theme DEBEN aplicarse de forma centralizada, de
  modo que cambiar de partner sea **cambiar valores de marca**, no reescribir ni
  recompilar los componentes de interfaz.
- **FR-003**: Los componentes reutilizables de interfaz **no** DEBEN contener
  colores ni assets de marca embebidos; toda apariencia de marca DEBE provenir de
  los valores aplicados desde el theme activo (Constitución — no hardcodear
  marca).
- **FR-004**: El sistema DEBE actualizar los **metadatos de página** (favicon y
  título de pestaña) para que correspondan al partner activo.
- **FR-005**: El **theme activo** aplicado a la interfaz DEBE mantenerse como
  estado síncrono de UI transversal (no como dato de servidor cacheable) y DEBE
  reflejar en todo momento el branding del partner resuelto.

#### Anti-FOUC (primer paint con marca)

- **FR-006**: El **primer contenido visible** entregado al usuario DEBE incluir
  ya el branding del partner resuelto (colores, logo, favicon, título): la marca
  se resuelve **antes** de pintar, no después.
- **FR-007**: El branding usado para el primer paint DEBE reutilizarse cuando la
  experiencia se vuelve interactiva, **sin re-resolver ni re-solicitar** el theme,
  garantizando que no haya cambio visible de marca (**FOUC = 0**).
- **FR-008**: La **tipografía de marca** DEBE aplicarse sin bloquear el render y
  sin producir un salto de estilos perceptible (comportamiento de precarga y
  sustitución tipográfica adecuado).
- **FR-009**: En caso de fallback (slug no servible), el primer paint DEBE traer
  el **theme por defecto** neutro, también sin flash ni reajuste posterior.

#### Caché y navegación

- **FR-010**: El branding de un partner DEBE tratarse como **estado de servidor
  cacheable**: una vez resuelto, la **navegación entre pasos** del journey del
  mismo partner **no** DEBE originar una nueva solicitud de branding.
- **FR-011**: El sistema DEBE soportar **caché del theme en múltiples capas**
  (cliente y servidor/CDN) de modo que la experiencia no dependa de re-consultar
  el origen del branding en cada visita ni en cada paso.
- **FR-012**: Al **publicar** un cambio de branding, el sistema DEBE **invalidar**
  el branding cacheado del partner afectado de modo que las visitas posteriores
  —tras una ventana acotada de propagación— reflejen el cambio **sin redeploy** de
  la aplicación.
- **FR-013**: La invalidación DEBE apoyarse en la **versión** del theme (definida
  en la feature `002`) de forma que un branding nuevo no quede servido con datos
  de una versión anterior.

#### Consistencia y fallback

- **FR-014**: El branding entregado en el primer paint y el aplicado tras volverse
  interactiva la experiencia DEBEN derivar del **mismo** theme resuelto (misma
  fuente de datos), sin discrepancias entre ambos momentos.
- **FR-015**: El mismo motor de theming DEBE representar **marcas visualmente
  distintas** (validado con al menos dos partners: **Banco Popular** y **Banco
  Occidente**) aplicando únicamente valores distintos, sin variantes de marca
  embebidas por componente.
- **FR-016**: Ante un `slug` no servible (inexistente, partner inactivo, raíz), el
  sistema DEBE aplicar el **theme por defecto** neutro de plataforma, de forma
  **indistinguible** entre los motivos de fallback (sin revelar la existencia de
  partners).
- **FR-017**: La ausencia o falla de un **asset** de marca individual (logo,
  favicon o fuente) **no** DEBE impedir la aplicación del resto del branding ni
  provocar un parpadeo del conjunto.

### Key Entities *(include if feature involves data)*

- **Theme activo (estado de UI)**: representación del branding del partner
  actualmente aplicado a la experiencia; refleja el theme resuelto y es la fuente
  desde la que la interfaz toma colores, logos, favicon, título, footer y legales.
  Es estado síncrono transversal, no dato de servidor.
- **Proyección pública de theme (entrada)**: contrato de branding consumido desde
  la feature `002` (colores, assets, textos legales, tipografía, versión); es la
  **entrada** que este motor aplica. No se redefine aquí.
- **Branding transferido al primer paint**: el theme resuelto que acompaña al
  primer contenido entregado y que se reutiliza al volverse interactiva la
  experiencia, garantizando continuidad de marca sin re-resolución.
- **Theme por defecto de plataforma**: branding neutro aplicado en los casos de
  fallback; mismo contrato público, sin datos de un banco real.
- **Metadatos de página**: favicon y título de pestaña derivados del theme del
  partner activo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al cargar la URL de un partner activo con branding publicado, el
  **100%** de los elementos de identidad (colores, logo, favicon, título) del
  primer paint corresponden al partner, con **cero** ocurrencias de flash de marca
  por defecto (**FOUC = 0**), verificado por auditoría visual.
- **SC-002**: Entre el contenido inicial entregado y la experiencia ya
  interactiva, se observan **cero** cambios de marca (colores, logo, favicon,
  título) — la marca es idéntica en ambos momentos.
- **SC-003**: Navegar entre pasos del journey de un mismo partner genera **cero**
  solicitudes adicionales de branding tras la primera resolución.
- **SC-004**: Dos partners de identidad visual opuesta (**Banco Popular** verde y
  **Banco Occidente** azul) se renderizan cada uno con **el 100%** de su propia
  marca, sin mezclar valores entre partners y sin variantes de marca embebidas por
  componente.
- **SC-005**: Tras publicar un cambio de branding, una visita posterior refleja el
  nuevo valor **sin redeploy**, dentro de la ventana de propagación de caché
  definida, en el **100%** de las nuevas visitas posteriores a la propagación.
- **SC-006**: Toda solicitud en caso de fallback (slug desconocido, partner
  inactivo, raíz) aplica el theme por defecto neutro en el primer paint, sin
  parpadeo y de forma **indistinguible** entre motivos de fallback.
- **SC-007**: El favicon y el título de la pestaña corresponden al partner activo
  en el **100%** de las cargas de un partner servible.
- **SC-008**: **Cero** componentes de interfaz contienen colores o assets de marca
  hardcodeados; el 100% de la apariencia de marca proviene de valores aplicados
  desde el theme.

## Assumptions

- **Dependencias entre features** (fuera de re-discusión aquí):
  - La **resolución de tenant y ruteo** (feature `001-resolucion-tenant-routing`)
    provee el `partnerSlug` a partir de la URL, así como la lista de partners
    servibles y la regla de fallback. Esta feature **consume** ese `slug`, no lo
    resuelve.
  - El **modelo de partner y contrato de theme** (feature `002-modelo-partner-theme`)
    provee la **proyección pública** del theme (shape de colores, assets, legales,
    tipografía y versión). Esta feature **aplica** ese contrato, no lo define.
  - La **exposición del contrato al front** (BFF) y la **administración/publicación**
    del branding (Back Office) son features/PRD posteriores (04/05). Esta feature
    define **cómo se aplica y no parpadea** el branding, no cómo se transporta ni
    se edita. El editor de administración es responsable de la validación de
    **contraste accesible (WCAG)**.
- **Decisiones ya fijadas en el PRD 00/03** (fuera de re-discusión):
  - El anti-FOUC se logra **resolviendo el theme en el servidor** y transfiriendo
    ese estado resuelto al cliente para que **hidrate con el mismo theme**, sin
    re-fetch ni recálculo. Los nombres concretos de mecanismo (SSR de Angular,
    `TransferState`, TanStack Query, NgRx Signals, CSS custom properties, Tailwind
    v4) son **detalle de planificación** y están fijados por la Constitución y la
    arquitectura del proyecto.
  - El branding se aplica como **valores de marca centralizados** que la capa de
    estilos consume, de modo que cambiar de partner no toca los componentes.
  - El criterio duro del producto es **FOUC = 0**: el primer paint ya trae la
    marca.
- Los **valores concretos** de tiempos de frescura/expiración de caché (staleness,
  ventana de propagación de invalidación, `Cache-Control`/CDN) y los parámetros de
  precarga tipográfica son parámetros de configuración; se asumen valores estándar
  de la industria salvo indicación contraria en planificación.
- La **validación funcional** de esta feature se realiza con auditoría visual
  automatizada (herramienta de navegador del proyecto) comparando el primer render
  con la experiencia ya interactiva, sobre al menos los dos partners de referencia
  (Banco Popular y Banco Occidente) y un caso de fallback.
