# Feature Specification: Resolución de Tenant y Routing

**Feature Branch**: `001-resolucion-tenant-routing`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "resolucion de tenant — crea una especificación basado en el prd prds/01-resolucion-de-tenant-y-routing.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acceso a un partner activo por URL (Priority: P1)

Un usuario final abre un enlace del tipo `app.com/{partner}/...` (por ejemplo,
`app.com/popular/oferta`). El sistema identifica al partner a partir del primer
segmento de la URL y presenta la experiencia con la identidad visual (theme) de
ese partner desde el primer render.

**Why this priority**: Es la razón de ser de la plataforma multi-tenant. Sin la
resolución correcta del partner a partir de la URL, ninguna otra funcionalidad
(theming, journey, ofertas) puede mostrarse en el contexto correcto. Constituye
el MVP: un único partner accesible por su enlace ya entrega valor.

**Independent Test**: Se puede probar de forma aislada abriendo la URL de un
partner activo y verificando que la aplicación reconoce el `partnerSlug` correcto
y que la experiencia se presenta bajo ese partner, sin depender del Back Office
ni de otros módulos.

**Acceptance Scenarios**:

1. **Given** un partner `popular` activo, **When** el usuario abre
   `app.com/popular/oferta`, **Then** la aplicación resuelve el partner `popular`
   y presenta la experiencia con el theme de ese partner.
2. **Given** un partner activo, **When** el usuario navega entre pasos del journey
   del mismo partner (p. ej. de `oferta` a `beneficiarios`), **Then** el partner
   permanece resuelto y la identidad visual no vuelve a solicitarse (se reutiliza
   lo ya cargado).
3. **Given** un enlace de partner, **When** la página se carga por primera vez,
   **Then** la identidad correcta aparece en el render inicial sin parpadeo ni
   cambio visible de theme.

---

### User Story 2 - Enlace inválido o partner inactivo (Priority: P1)

Un usuario abre un enlace cuyo primer segmento no corresponde a ningún partner
activo (slug inexistente, escrito con formato inválido, o partner desactivado).
El sistema presenta una landing neutra con la identidad por defecto de la
plataforma y un mensaje claro, sin exponer información interna ni distinguir la
causa del fallo.

**Why this priority**: Determina el comportamiento seguro y la experiencia ante
enlaces caducados, mal formados o de partners dados de baja. Es crítico tanto
para la experiencia de usuario como para la seguridad (evitar enumeración de
partners). Debe existir junto al camino feliz para que la plataforma sea
publicable.

**Independent Test**: Se puede probar abriendo una URL con un segmento
desconocido y verificando que se muestra la landing por defecto con mensaje
neutro, sin errores en consola ni pistas sobre la existencia o estado del slug.

**Acceptance Scenarios**:

1. **Given** un slug que no corresponde a ningún partner, **When** el usuario abre
   `app.com/no-existe/x`, **Then** se muestra la landing con la identidad por
   defecto y un mensaje neutro ("Este enlace no corresponde a un socio activo").
2. **Given** un partner que existe pero está inactivo, **When** el usuario abre su
   enlace, **Then** el comportamiento es idéntico al de un slug desconocido
   (respuesta uniforme, sin revelar que el partner existe).
3. **Given** un primer segmento con formato inválido (mayúsculas, caracteres no
   permitidos, longitud fuera de rango), **When** el usuario abre esa URL,
   **Then** el segmento no se interpreta como partner y se aplica el fallback por
   defecto.
4. **Given** cualquier caso de fallback, **When** se presenta la landing, **Then**
   la respuesta no revela la causa (no distingue "no existe" de "inactivo") ni
   filtra información interna.

---

### User Story 3 - Rutas reservadas del sistema (Priority: P2)

Rutas operativas de la plataforma —el Back Office (`/admin`), la API/BFF
(`/api`), y activos estáticos (`/assets`, `/static`, `/health`, etc.)— nunca se
interpretan como un partner, aunque su primer segmento pudiera pasar la
normalización de slug.

**Why this priority**: Protege el enrutamiento de la plataforma frente a
colisiones entre nombres reservados y slugs de partner. Es necesario para que
Back Office y servicios coexistan con el espacio de nombres de partners, pero es
secundario al camino de acceso de usuario final.

**Independent Test**: Se puede probar abriendo `app.com/admin` y verificando que
entra al Back Office y en ningún caso se trata como partner ni intenta resolver
un theme de partner.

**Acceptance Scenarios**:

1. **Given** la ruta reservada `/admin`, **When** el usuario la abre, **Then**
   accede al Back Office y nunca se interpreta como partner.
2. **Given** la lista de nombres reservados (`admin`, `api`, `assets`, `static`,
   `health`, etc.), **When** cualquiera aparece como primer segmento, **Then** se
   trata como ruta reservada y no como partner.
3. **Given** un intento de dar de alta un partner con un slug reservado, **When**
   se valida el alta, **Then** el sistema lo rechaza para evitar colisiones de
   ruteo.

---

### Edge Cases

- **Raíz sin segmento (`app.com/`)**: se presenta una landing neutra con la
  identidad por defecto de la plataforma, sin listar ni exponer los partners
  activos (formerly referred to as "landing/selector").
- **Slug en mayúsculas o con espacios** (`app.com/Popular` / `app.com/ popular `):
  se normaliza (minúsculas, recorte de espacios); si tras normalizar coincide con
  un partner activo, resuelve; si no, fallback.
- **Slug con caracteres no permitidos** (fuera de `[a-z0-9-]`): no matchea → fallback.
- **Slug demasiado corto (< 2) o demasiado largo (> 40)**: fuera de rango → fallback.
- **Desalineación entre lo resuelto en servidor y en cliente**: la identidad
  presentada debe ser la misma en ambos; no debe producirse un cambio visible de
  theme al hidratar.
- **Colisión futura entre un slug existente y una nueva ruta reservada**: la lista
  de reservados está versionada y el alta de partners valida contra ella.
- **Enumeración por fuerza bruta de slugs**: la respuesta de fallback uniforme no
  permite distinguir partners existentes de inexistentes.
- **Fuente de la lista de partners inaccesible o en error**: la resolución falla de
  forma segura hacia el fallback por defecto (landing neutra), sin distinguirse de
  un slug desconocido ni exponer la indisponibilidad.

## Clarifications

### Session 2026-07-04

- Q: ¿Cómo debe comportarse la resolución cuando la fuente de la lista de partners activos está inaccesible o falla? → A: Fail safe — resolver como fallback (landing neutra por defecto), idéntico a un slug desconocido.
- Q: ¿Qué observabilidad (logs/métricas/auditoría) debe emitir la resolución sobre su resultado y el motivo interno de fallback? → A: Ninguna en esta feature; se delega íntegramente a la feature de observabilidad de la plataforma.
- Q: ¿Qué frescura debe tener la lista de partners activos frente a un cambio de estado (p. ej. desactivación)? → A: TTL acotado — la lista puede estar desactualizada como máximo una ventana corta definida; la desactivación surte efecto dentro de esa ventana.
- Q: La raíz (`app.com/`) ¿presenta un selector que lista los partners activos o una landing neutra que no expone la lista? → A: Landing neutra que NO lista partners; en ningún punto se expone un directorio de partners (coherente con la postura anti-enumeración).
- Q: ¿Cómo se compara el primer segmento contra la lista de nombres reservados (sensibilidad a mayúsculas, orden respecto a la normalización)? → A: Coincidencia exacta case-insensitive sobre el segmento en crudo (minusculizado), evaluada ANTES de la normalización de slug y con precedencia sobre la resolución de partner.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE identificar al partner a partir del **primer
  segmento** de la ruta de la URL (`app.com/{partnerSlug}/...`).
- **FR-002**: El sistema DEBE **normalizar** el candidato a slug antes de
  compararlo: convertir a minúsculas, recortar espacios, admitir únicamente
  `[a-z0-9-]` (kebab-case) y exigir longitud entre 2 y 40 caracteres. Cualquier
  candidato que no cumpla no se interpreta como partner.
- **FR-003**: El sistema DEBE comparar el slug normalizado contra la **lista de
  partners activos** vigente y considerar válido solo lo que corresponda a un
  partner en estado activo.
- **FR-004**: El sistema DEBE tratar la raíz (`app.com/`) como acceso sin partner
  y presentar una **landing neutra** con la identidad por defecto que **NO lista ni
  expone los partners activos** (sin directorio ni selector enumerable), de forma
  coherente con la postura anti-enumeración (FR-007, SC-003).
- **FR-005**: El sistema DEBE reconocer un conjunto de **nombres reservados**
  (`admin`, `api`, `assets`, `static`, `health`, `_next`, `favicon.ico`,
  `robots.txt`) y nunca interpretarlos como partner, con precedencia sobre la
  interpretación de partner. La coincidencia DEBE ser **exacta e insensible a
  mayúsculas/minúsculas** sobre el primer segmento en crudo (minusculizado para la
  comparación) y DEBE evaluarse **antes** de la normalización de slug (FR-002), de
  modo que segmentos como `/Admin`, `/API` o `favicon.ico` se reconozcan como
  reservados aunque no cumplan el charset de slug.
- **FR-006**: El sistema DEBE aplicar un **fallback a la identidad por defecto**
  cuando el slug sea desconocido o el partner esté inactivo, presentando una
  landing neutra con un mensaje claro.
- **FR-007**: El fallback DEBE ofrecer una **respuesta uniforme**: no revelar la
  causa del fallo ni permitir distinguir "slug inexistente" de "partner inactivo".
- **FR-008**: El sistema DEBE **reutilizar la identidad ya resuelta** durante la
  navegación entre pasos del journey de un mismo partner, sin volver a solicitarla.
- **FR-009**: La resolución del partner DEBE producir la identidad correcta en el
  **render inicial** (sin parpadeo ni cambio visible de theme posterior).
- **FR-010**: La resolución DEBE ser **determinista e idempotente**: la misma URL
  produce siempre el mismo resultado, y re-evaluarla (p. ej. al continuar la
  navegación tras la carga inicial) no cambia el resultado ni la identidad
  presentada.
- **FR-011**: El resultado de la resolución DEBE distinguir de forma explícita los
  casos: **partner válido**, **ruta reservada**, **raíz** y **fallback** (con su
  motivo interno), de modo que sea verificable de forma aislada.
- **FR-012**: El alta de un partner (Back Office) DEBE **validar el slug contra la
  lista de reservados** y rechazar colisiones.
- **FR-013**: El diseño de la resolución DEBE ser **extensible** para incorporar
  en el futuro el host además del path (evolución a subdominios) sin obligar a
  reescribir a quienes consumen el resultado.
- **FR-014**: Cuando la fuente de la lista de partners activos esté inaccesible o
  falle, la resolución DEBE **fallar de forma segura** (fail-safe) resolviendo como
  **fallback** con la identidad por defecto, de forma **indistinguible** de un slug
  desconocido; nunca DEBE revelar la indisponibilidad ni exponer información de
  partners.
- **FR-015**: La lista de partners activos consumida por la resolución DEBE tener
  una **frescura acotada por un TTL** definido: puede estar desactualizada como
  máximo esa ventana corta, y un cambio de estado (p. ej. desactivación de un
  partner) DEBE surtir efecto en la resolución dentro de dicha ventana. El valor
  concreto del TTL es un parámetro de configuración (detalle de planificación). La
  reutilización de la identidad durante la navegación de un mismo journey (FR-008)
  opera sobre lo resuelto dentro de esa ventana de frescura.

### Key Entities *(include if feature involves data)*

- **Partner (socio/banco)**: entidad de negocio identificada por un `partnerSlug`
  único en kebab-case, con un estado (activo/inactivo) y una identidad visual
  asociada. Es lo que un enlace de partner pretende resolver.
- **Resolución de Tenant**: resultado de interpretar una URL, con cuatro formas
  posibles — partner válido (con su slug), ruta reservada (con el área: back
  office / API / activos), raíz, o fallback (con el motivo interno: slug
  desconocido o partner inactivo).
- **Lista de Partners Activos**: conjunto vigente de slugs habilitados contra el
  que se valida cada candidato; es la fuente de verdad del estado de cada partner.
- **Lista de Nombres Reservados**: conjunto versionado de primeros segmentos que
  nunca pueden pertenecer a un partner y tienen precedencia sobre la resolución.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las URLs de partners activos resuelven al partner correcto
  y presentan su identidad visual.
- **SC-002**: El 100% de las URLs con slug desconocido, formato inválido o partner
  inactivo presentan la landing por defecto con mensaje neutro, sin errores
  visibles y sin filtrar la causa.
- **SC-003**: Las respuestas de fallback son **indistinguibles** entre "slug
  inexistente" y "partner inactivo" (un observador externo no puede inferir la
  existencia de un partner a partir de la respuesta).
- **SC-004**: Al navegar entre pasos del journey de un mismo partner, la identidad
  visual no vuelve a solicitarse en el 100% de las navegaciones internas.
- **SC-005**: En la carga inicial de un enlace de partner, la identidad correcta
  se muestra desde el primer render, sin cambio visible de theme posterior.
- **SC-006**: La verificación de la lógica de resolución cubre todos los casos:
  slug válido, ruta reservada, raíz, slug desconocido, partner inactivo, charset
  inválido y longitud fuera de rango.
- **SC-007**: Incorporar un nuevo partner solo requiere cambios de configuración
  (alta de datos), sin cambios en la infraestructura de red ni en el enrutamiento.

## Assumptions

- La decisión de estrategia de URL es **path prefix** (`app.com/{partnerSlug}/...`),
  fijada en el PRD 00/01; los subdominios quedan como evolución futura y el diseño
  se mantiene extensible a ese modo.
- La identidad visual (theme) por defecto de la plataforma existe y está definida
  en el ámbito de Modelo/Theme y Theming (PRD 02/03); esta feature solo determina
  **cuándo** aplicarla (fallback y raíz), no su contenido.
- La lista de partners activos y el estado de cada partner provienen del
  BFF/plataforma (PRD 02/04); esta feature consume esa fuente de verdad, no la
  administra.
- El comportamiento de fallback recomendado es **renderizar una landing neutra**
  con theme default (frente a la alternativa de redirigir a la raíz); se asume la
  landing neutra como default de producto salvo indicación contraria.
- El alta y administración de partners (incluida la validación de slug reservado)
  se realiza desde el Back Office (PRD 05); aquí solo se especifica la regla que
  ese alta debe cumplir.
- La resolución ocurre tanto en el servidor (primer render) como en el cliente
  (navegación posterior) de forma coherente; los mecanismos concretos son detalle
  de implementación y de los PRD 03/04.
- La **observabilidad** (logs, métricas, auditoría) del resultado de resolución y
  del motivo interno de fallback queda **fuera del alcance** de esta feature y se
  delega a la feature/PRD de observabilidad de la plataforma. El motivo interno de
  fallback (FR-011) se mantiene disponible en el resultado para que esa capa lo
  consuma, pero esta feature no define su emisión.
