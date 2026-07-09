# Feature Specification: Modelo de Partner y Contrato de Theme

**Feature Branch**: `002-modelo-partner-theme`

**Created**: 2026-07-04

**Status**: Draft

**Input**: User description: "modelo de partner — crea la especificación basado en el prd prds/02-modelo-de-partner-y-contrato-de-theme.md; diseños de referencia de dos bancos (Banco Popular y Banco Occidente) en Figma."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Alta de un partner con su identidad visual (Priority: P1)

Un administrador da de alta un nuevo banco distribuidor (partner): registra su
identidad (nombre visible y un `slug` de URL único) y define su branding inicial
—colores, logos, favicon, tipografía y textos legales— como una primera versión
de theme en estado **borrador**. El partner queda persistido con una primera
versión de su theme, lista para ser revisada antes de publicarse.

**Why this priority**: Sin la capacidad de modelar y persistir un partner y su
branding, ninguna otra pieza de la plataforma (resolución de tenant, theming
del front, Back Office) tiene datos que consumir. Es el cimiento del modelo
multi-tenant y por sí solo entrega valor: define la fuente de verdad del
catálogo de partners.

**Independent Test**: Se puede probar creando un partner con su branding y
verificando que quedan persistidos un `Partner` y su `PartnerTheme` versión 1
en estado borrador, con `slug` único, sin necesidad de publicar ni de servir el
theme al front.

**Acceptance Scenarios**:

1. **Given** un `slug` disponible y no reservado, **When** el administrador crea
   un partner con su branding inicial, **Then** se persisten un `Partner` (estado
   `active`) y su `PartnerTheme` versión 1 en estado **borrador** (sin publicar).
2. **Given** un `slug` ya usado por otro partner, **When** se intenta el alta,
   **Then** el sistema **rechaza** la creación por unicidad de `slug`.
3. **Given** un `slug` con formato inválido o que colisiona con un nombre
   reservado de ruteo, **When** se intenta el alta, **Then** el sistema lo
   **rechaza** antes de persistir (coherente con la resolución de tenant).
4. **Given** un partner creado, **When** se consulta su identidad, **Then** el
   `slug` es **inmutable**: no existe operación que lo modifique.

---

### User Story 2 - Servir el theme público de un partner activo (Priority: P1)

El front (experiencia de usuario final) solicita el branding de un partner
activo por su `slug` y recibe una **proyección pública** del theme publicado
vigente: colores, logos, favicon, tipografía y textos legales. Esta proyección
**nunca** incluye identificadores internos sensibles, credenciales ni endpoints
de integración.

**Why this priority**: Es el contrato de consumo del branding: lo que hace que
la identidad visual de cada banco llegue a la experiencia. Es la contraparte de
la resolución de tenant y habilita el theming del front (anti-FOUC). Sin él, el
modelo persistido no es observable por el producto.

**Independent Test**: Se puede probar solicitando el theme público de un partner
con una versión publicada y verificando que la respuesta tiene exactamente el
shape del contrato público (colores, assets, legales, tipografía, versión) y no
contiene ningún campo interno sensible.

**Acceptance Scenarios**:

1. **Given** un partner activo con una versión de theme **publicada**, **When**
   el front solicita su theme por `slug`, **Then** recibe la proyección pública
   del theme publicado vigente, con el número de versión.
2. **Given** la proyección pública devuelta, **When** se inspecciona su
   contenido, **Then** **no** contiene identificadores internos sensibles,
   credenciales ni endpoints de integración.
3. **Given** un partner cuyo theme solo tiene versiones en **borrador** (nunca
   publicado), **When** el front lo solicita, **Then** **no** se sirve branding
   de borrador (se trata como no servible / cae al theme default).
4. **Given** un partner en estado **inactive**, **When** el front lo solicita,
   **Then** su theme **no** es servible y se resuelve el theme default (fallback),
   sin revelar que el partner existe.

---

### User Story 3 - Versionado, publicación y rollback del theme (Priority: P1)

Un administrador edita el branding de un partner existente. Cada guardado crea
una **nueva versión** del theme sin sobrescribir las anteriores; el front sigue
sirviendo la versión **publicada** hasta que se publique explícitamente la
nueva. Publicar mueve el puntero de theme vigente a la versión elegida; revertir
(rollback) es re-publicar una versión anterior, que sigue existiendo en el
historial.

**Why this priority**: El versionado es requisito de trazabilidad y de
operación segura (previsualizar antes de publicar, revertir sin pérdida). Es
tan crítico como servir el theme, porque protege la producción de cambios
accidentales y sostiene la auditoría.

**Independent Test**: Se puede probar editando y publicando el theme de un
partner y verificando que se crea una versión nueva, que la anterior sigue
existiendo, que el front sirve la publicada, y que re-publicar una versión
anterior restaura ese branding sin perder historial.

**Acceptance Scenarios**:

1. **Given** un partner con theme versión 1 publicada, **When** el administrador
   edita y guarda, **Then** se crea la versión 2 (borrador) y la versión 1
   permanece intacta y sigue siendo la servida hasta publicar.
2. **Given** la versión 2 en borrador, **When** el administrador la publica,
   **Then** el puntero de theme vigente del partner pasa a la versión 2 y el
   front la sirve.
3. **Given** un historial con versiones 1 y 2 (2 publicada), **When** el
   administrador **re-publica** la versión 1, **Then** el front vuelve a servir
   el branding de la versión 1 y ninguna versión se pierde del historial.
4. **Given** cualquier versión guardada, **When** se inspecciona su registro,
   **Then** consta **quién** la creó y **cuándo** (insumo de auditoría).

---

### User Story 4 - Gestión de assets de marca (logos, favicon, fuentes) (Priority: P2)

Al definir o editar el branding, el administrador sube binarios de marca (logo
del producto, logo co-branded del banco, logo del grupo, favicon, imagen de
compartición, fuente tipográfica). Los binarios se almacenan fuera de la base de
datos, en almacenamiento de objetos servido por CDN; el modelo del partner solo
guarda las **URLs** públicas. La subida se valida (tipo, tamaño, dimensiones) y
los SVG se sanitizan.

**Why this priority**: Los assets son parte esencial del branding, pero su
gestión es separable del modelo de datos central y del contrato: el theme puede
existir y servirse con URLs. Es importante para completar la experiencia visual,
por lo que es secundaria a US1–US3.

**Independent Test**: Se puede probar subiendo un logo y verificando que el
binario queda alojado en el almacenamiento de objetos/CDN, que el theme guarda
solo su URL, y que un archivo inválido (tipo/tamaño/dimensión no permitidos, o
SVG malicioso) es rechazado o sanitizado.

**Acceptance Scenarios**:

1. **Given** un archivo de logo válido, **When** el administrador lo sube,
   **Then** el binario se aloja en el almacenamiento de objetos/CDN y el theme
   guarda **solo la URL**, nunca el binario.
2. **Given** un archivo que excede el tamaño, tipo MIME o dimensiones
   permitidas, **When** se intenta subir, **Then** el sistema lo **rechaza** con
   un mensaje claro.
3. **Given** un SVG con contenido potencialmente malicioso, **When** se sube,
   **Then** se **sanitiza** (o se rechaza) antes de quedar disponible.
4. **Given** la subida de assets, **When** ocurre desde el front/Back Office,
   **Then** el cliente **nunca** recibe credenciales del bucket (la subida la
   intermedia el servidor).

---

### User Story 5 - Theme por defecto de plataforma (fallback) (Priority: P2)

Existe un theme **neutro de plataforma** asociado a un partner sintético
`__default__`, usado cuando la resolución de tenant cae en fallback (slug
desconocido, partner inactivo o raíz). No corresponde a un banco real y no se
presenta como un partner editable estándar en el Back Office (se marca como del
sistema).

**Why this priority**: Es la red de seguridad visual de la plataforma y el
contraparte del fallback de la resolución de tenant. Es necesario para que la
experiencia nunca quede sin identidad, pero depende de que el modelo de theme
(US1–US2) exista primero.

**Independent Test**: Se puede probar solicitando el branding en un caso de
fallback y verificando que se sirve el theme neutro de plataforma, con el mismo
shape del contrato público, sin exponer datos de ningún banco real.

**Acceptance Scenarios**:

1. **Given** una resolución de tenant en fallback, **When** se solicita el
   branding, **Then** se sirve el theme neutro del partner `__default__` con el
   contrato público estándar.
2. **Given** el partner `__default__`, **When** se lista el catálogo de partners
   del Back Office, **Then** **no** aparece como un partner editable estándar (se
   distingue como del sistema).

---

### Edge Cases

- **Dos bancos con branding visualmente distinto**: el mismo contrato de theme
  debe representar dos marcas diferentes (p. ej. **Banco Popular** y **Banco
  Occidente**, según los diseños de referencia) sin cambios de esquema; solo
  cambian los valores de los tokens/assets/legales/tipografía.
- **Ampliar la paleta de tokens**: agregar un token nuevo (campo opcional) no
  debe romper a los consumidores existentes (front y Back Office) que aún no lo
  conocen.
- **Publicar sin cambios**: publicar una versión idéntica a la vigente no debe
  corromper el historial ni el puntero de versión vigente.
- **Crecimiento del historial de versiones**: acumular muchas versiones (incluidos
  borradores) no debe degradar el servicio del theme publicado.
- **`slug` reservado o duplicado en el alta**: se rechaza antes de persistir (ver
  US1); nunca se crea un partner que colisione con el ruteo.
- **Asset referenciado por URL que deja de existir**: el modelo guarda URLs; la
  rotura de un binario no debe corromper el registro del theme.
- **Reinicio o caída de la instancia**: la configuración publicada vigente debe
  sobrevivir y quedar disponible al volver a arrancar, sin pérdida perceptible.
- **Solicitud de theme para un partner sin ninguna versión publicada**: se trata
  como no servible y cae al theme default, no se sirve un borrador.

## Requirements *(mandatory)*

### Functional Requirements

#### Modelo y contrato

- **FR-001**: El sistema DEBE modelar un **Partner** con, al menos: identificador
  interno, `slug` de URL, nombre visible, estado (`active`/`inactive`), referencia
  al theme publicado vigente y metadatos de auditoría (quién/cuándo de creación y
  última modificación).
- **FR-002**: El `slug` de un partner DEBE ser **único** e **inmutable** una vez
  creado.
- **FR-003**: La baja de un partner DEBE ser **lógica** (`inactive`); el sistema
  **nunca** DEBE borrar físicamente un partner (requisito de trazabilidad).
- **FR-004**: El sistema DEBE modelar un **PartnerTheme** que contenga **todo** el
  branding configurable de un partner y **ninguna** lógica de negocio, journey ni
  composición de producto (la multi-tenancy es solo branding visual).
- **FR-005**: El PartnerTheme DEBE agrupar, como mínimo: **tokens** de color,
  **assets** (logo de producto, logo co-branded del banco, logo de grupo opcional,
  favicon, imagen de compartición opcional), **textos legales** (disclaimer y
  enlaces opcionales) y **tipografía** (familia y fuente custom opcional).
- **FR-006**: El modelo DEBE ser **aditivo/extensible**: incorporar un token o
  atributo nuevo (como campo opcional) **no** DEBE romper a los consumidores
  existentes que no lo conocen.
- **FR-007**: El sistema DEBE exponer una **proyección pública** del theme del
  partner activo (contrato de consumo del front) que **excluya** identificadores
  internos sensibles, credenciales y endpoints de integración.
- **FR-008**: El contrato público DEBE ser la **única fuente de verdad** del shape
  del theme, compartida por front y Back Office; ningún consumidor lo redefine.
- **FR-009**: El mismo contrato de theme DEBE poder representar **marcas
  visualmente distintas** de distintos bancos (validado con al menos dos: Banco
  Popular y Banco Occidente) **sin** cambios de esquema.

#### Versionado, publicación y auditoría

- **FR-010**: Cada guardado de theme DEBE crear una **versión nueva** (incremental)
  sin sobrescribir las anteriores.
- **FR-011**: El sistema DEBE distinguir versiones en **borrador** (no publicadas)
  de versiones **publicadas**; el front DEBE servir **solo** versiones publicadas.
- **FR-012**: **Publicar** una versión DEBE mover el puntero de theme vigente del
  partner a esa versión; el historial de versiones anteriores DEBE conservarse.
- **FR-013**: El **rollback** DEBE lograrse **re-publicando** una versión anterior
  existente, sin pérdida de historial.
- **FR-014**: Cada versión de theme DEBE registrar **quién** la creó y **cuándo**,
  como insumo de auditoría.

#### Assets

- **FR-015**: Los binarios de marca (logos, favicon, imagen de compartición,
  fuentes) DEBEN almacenarse **fuera de la base de datos** (almacenamiento de
  objetos servido por CDN); el modelo del partner DEBE guardar **solo URLs**.
- **FR-016**: La subida de assets DEBE **validarse** (tipo MIME, tamaño máximo,
  dimensiones) y los **SVG DEBEN sanitizarse** (o rechazarse) antes de quedar
  disponibles.
- **FR-017**: El cliente (front/Back Office) **nunca** DEBE recibir credenciales
  del almacenamiento de objetos; la subida DEBE intermediarse del lado del
  servidor.

#### Fallback

- **FR-018**: El sistema DEBE proveer un **theme por defecto** neutro de
  plataforma (partner sintético `__default__`) para los casos de fallback de la
  resolución de tenant.
- **FR-019**: El partner `__default__` **no** DEBE presentarse como un partner
  editable estándar en el catálogo del Back Office (se marca como del sistema).

#### Acceso a datos, persistencia y durabilidad

- **FR-020**: Todo acceso a los datos de partners y themes DEBE realizarse **a
  través de un único límite de acceso a datos** (puerto de repositorio); ningún
  consumidor de dominio o del servidor de aplicación DEBE ejecutar consultas de
  base de datos directas.
- **FR-021**: El **motor de almacenamiento** DEBE ser **intercambiable por
  configuración** sin cambiar el comportamiento observable ni el dominio ni los
  handlers (misma batería de pruebas de contrato válida para cualquier adaptador).
- **FR-022**: Cada **mutación** de datos y su registro de **auditoría**
  correspondiente DEBEN persistirse de forma **atómica** (todo o nada).
- **FR-023**: La configuración **publicada vigente** DEBE ser **durable**: DEBE
  sobrevivir a un reinicio o caída de la instancia y estar disponible al volver a
  arrancar, con pérdida máxima acotada a una ventana corta (RPO del orden de
  segundos).

### Key Entities *(include if feature involves data)*

- **Partner (socio/banco)**: identidad y estado del banco distribuidor.
  Atributos clave: `slug` único e inmutable, nombre visible, estado
  (`active`/`inactive`), puntero al theme publicado vigente y metadatos de
  auditoría. Es la unidad del catálogo multi-tenant.
- **PartnerTheme (contrato de branding)**: una **versión** del branding de un
  partner. Agrupa tokens de color, assets, textos legales y tipografía. Tiene un
  número de versión y un estado (borrador/publicada). No contiene lógica.
- **Proyección pública de theme**: vista de consumo del front derivada del
  PartnerTheme publicado; incluye `slug`, nombre visible, versión, tokens,
  assets, legales y tipografía; **excluye** todo dato interno sensible.
- **Versión de theme (historial)**: cada guardado del branding, conservado para
  trazabilidad, previsualización, publicación y rollback; portador de la
  información de auditoría (quién/cuándo).
- **Asset de marca**: binario (logo, favicon, imagen, fuente) alojado en
  almacenamiento de objetos/CDN y referenciado por URL desde el theme.
- **Theme por defecto de plataforma**: branding neutro asociado al partner
  sintético `__default__`, servido en los casos de fallback.
- **Registro de auditoría**: entrada que documenta quién realizó qué cambio y
  cuándo sobre partners y themes; se persiste junto con la mutación que describe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los themes publicados de partners activos se sirven al
  front con el shape exacto del contrato público y **cero** campos internos
  sensibles filtrados.
- **SC-002**: Crear un partner y su branding es una operación de **solo
  configuración** (alta de datos), sin cambios de código ni de infraestructura de
  red.
- **SC-003**: Dos bancos con branding visualmente distinto (**Banco Popular** y
  **Banco Occidente**) se representan con el **mismo contrato** de theme sin
  cambios de esquema; el 100% de los tokens/assets/legales/tipografía de cada uno
  se expresa dentro del contrato.
- **SC-004**: Editar y publicar el branding **preserva el 100%** de las versiones
  anteriores (historial completo), y re-publicar una versión anterior restaura su
  branding sin pérdida.
- **SC-005**: El 100% de las versiones de theme tienen registrada la información
  de auditoría (quién/cuándo).
- **SC-006**: El 100% de los binarios de marca se sirven vía almacenamiento de
  objetos/CDN y **cero** binarios se guardan en la base de datos.
- **SC-007**: Toda solicitud de branding en fallback (slug desconocido, partner
  inactivo, raíz) recibe el theme por defecto neutro, **indistinguible** de otros
  fallbacks (no revela la existencia de partners).
- **SC-008**: Tras un reinicio o caída de la instancia, la configuración
  publicada vigente vuelve a estar disponible con pérdida máxima acotada a una
  ventana corta (RPO del orden de segundos).
- **SC-009**: Cambiar el motor de almacenamiento subyacente **no** altera ningún
  comportamiento observable: la misma batería de pruebas de contrato pasa contra
  el nuevo motor sin cambios en dominio ni handlers.

## Assumptions

- **Decisiones ya fijadas en el PRD 00/02 (fuera de re-discusión aquí)**:
  - La multi-tenancy es **solo branding visual**; este modelo **no** incluye
    composición de producto, reglas de negocio ni pasos del journey por partner.
  - Persistencia V1: base **embebida** de baja cardinalidad, lectura intensiva y
    escritura rara solo-admin, con **respaldo continuo a un bucket** (durabilidad
    del orden de segundos) y **restauración al arrancar**. El escalado a
    multi-instancia se resuelve **migrando a una base cliente-servidor** mediante
    un **adaptador nuevo del mismo puerto de repositorio**, sin tocar dominio ni
    handlers. Los nombres concretos de tecnología (SQLite, Litestream, Postgres)
    y la variable de selección de motor son **detalle de planificación**.
  - La validación funcional de este PRD corre sobre **una sola instancia** (hito
    M1); la migración de motor (hito M2) se valida por separado.
- La **resolución de tenant** (qué partner corresponde a una URL, reservados,
  fallback) está especificada en la feature `001-resolucion-tenant-routing`; esta
  feature provee el **modelo, el contrato y la fuente de verdad** que aquella
  consume, y la regla de validación de `slug` (unicidad + no reservado) que el
  alta debe cumplir.
- El **theming del front** (aplicación de tokens, anti-FOUC) y la **arquitectura
  BFF** (exposición del contrato público, intermediación de subidas, secretos)
  son features/PRD posteriores (03/04); esta feature define **qué** contrato se
  expone y **qué** se excluye, no el mecanismo de transporte.
- La **administración** de partners y themes (UI de alta/edición/publicación,
  previsualización de borradores, listado) es la feature/PRD del **Back Office**
  (05); aquí se especifican las **reglas** que esa administración debe respetar.
- La **auditoría** detallada (formato, consulta, roles) es la feature/PRD 06;
  esta feature garantiza que cada versión y mutación **portan** la información de
  auditoría y se persisten atómicamente con ella.
- Los **valores concretos** de límites de assets (tamaño máximo, tipos MIME
  permitidos, dimensiones) y de **retención/paginación** del historial de
  versiones son parámetros de configuración; se asumen valores estándar de la
  industria salvo indicación contraria en planificación.
- Los **diseños de referencia** de Banco Popular y Banco Occidente (Figma) se usan
  como **casos de validación** de que el contrato representa dos marcas distintas.
  Los tokens reales de ambos bancos se **extrajeron de Figma** y se mapean al
  contrato en el Anexo A; los valores definitivos de cada partner se administran en
  el Back Office.

## Anexo A — Tokens de referencia de dos bancos (evidencia de FR-009 / SC-003)

Tokens **reales extraídos de Figma** de dos partners con identidad visual
opuesta —**Banco Popular** (marca verde) y **Banco Occidente** (marca azul)—
mapeados al mismo contrato `ThemeTokens`/`ThemeTypography`. Ambas marcas se
expresan **sin cambiar el esquema**: solo cambian los valores. Esto valida FR-006
(aditividad), FR-009 (mismo contrato, marcas distintas) y SC-003.

| Token del contrato | Banco Popular | Banco Occidente |
|--------------------|---------------|-----------------|
| `colorPrimary`       | `#00A056` (VerdePrin) | `#008ACC` (AzulClaro) |
| `colorPrimaryTint`   | `#E9F0D6` (Verde 20%) | `#B6ECFF` (Azul-300) |
| `colorSecondary`     | `#8FB434` (Verde secundario) | `#002449` (AzulOscuro) |
| `colorSecondaryTint` | `#D2E1AE` (Verde 40%) | `#CCD3DB` (AzulOscuro 20%) |
| `colorTextStrong`    | `#000000` | `#262626` (Negro-900) |
| `colorTextMuted`     | `#808080` (Gris-500) | `#808080` (Gris-500) |
| `colorSurface`       | `#FFFFFF` | `#FFFFFF` |
| `colorBorder`        | `#EBEBEB` (Grises Light) | `#CCCCCC` (Gris-300) |
| `fontFamily`         | `Poppins` (+ Core Sans A 45) | `Poppins` |

Colores de apoyo presentes en cada marca pero **fuera de la paleta mínima** del
contrato (candidatos a tokens aditivos opcionales, FR-006): Popular añade azules
(`#021D3F`, `#99D0EB`, `#007AFF`) y un fondo `#EFF2FC`; Occidente añade un azul
secundario `#0071D9`, un rojo semántico `#C3261F` y el mismo fondo `#EFF2FC`.

> **Fuentes (Figma):** Popular — archivo `AfEpPhGEPF9wbCZFX9ZRQ6`, nodo
> `1583:115571`. Occidente — archivo `8igWn4MXoho4WHWtmT1LWt`, nodo `12286:180424`.
> Tokens obtenidos con la lectura de variables del diseño; los tints y el mapeo a
> la paleta mínima son la interpretación de estos valores hacia el contrato.
