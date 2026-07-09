# Phase 0 — Research: Back Office — Gestión de Partners

Decisiones de diseño (D1..D8) que resuelven las incógnitas del `plan.md`. Cada
una: **Decisión / Rationale / Alternativas consideradas**. Ninguna en conflicto
con la Constitución (I–IV).

---

## D1. Aislamiento del preview en vivo (FR-010/011/012, SC-009) — **pieza clave**

**Decisión**: El `theme-preview` monta un **contenedor con scope propio** y
escribe los tokens del borrador como **CSS custom properties inline en el host
de ese contenedor** (`element.style.setProperty('--brand-primary', …)`),
reutilizando el proyector `toCssVars` de `003`
(`src/app/core/theme/theme-css-vars.ts`). **Nunca** escribe a
`document.documentElement` (`:root`) ni toca el `ThemeStore` global. Dentro del
contenedor se renderizan los **mismos átomos** que la experiencia real
(`brand-logo`, `brand-footer`, botones/cards de `ui/`), que ya leen `--brand-*`
por herencia de CSS variables — heredan las del host del preview, no las del
`:root` del panel.

**Rationale**:
- Las CSS custom properties **cascadean por herencia**: definidas en un
  contenedor, aplican a todo su subárbol y **no** afectan a los hermanos ni al
  ancestro. Es el mecanismo nativo de aislamiento, sin Shadow DOM ni iframe.
- Reutiliza el motor de tokens ya probado de `003` (`toCssVars`) → preview y
  producción proyectan idéntico (evita divergencia, riesgo PRD 05 §10).
- Zoneless-friendly: un `effect()`/`computed()` sobre el signal del borrador
  reescribe las propiedades del host; actualización <1 s (SC-002) sin round-trip.

**Alternativas consideradas**:
- **`iframe` con documento aislado**: aislamiento perfecto pero rompe la
  reutilización directa de componentes Angular (habría que bootstrapear una app
  hija) y complica hidratación SSR. Rechazado por sobre-ingeniería.
- **Shadow DOM (encapsulación nativa)**: aislaría estilos pero los átomos del
  proyecto no son web components y Tailwind no penetra shadow boundaries sin
  configuración extra. Rechazado.
- **Escribir a `:root` y "restaurar" al salir**: frágil (ensucia el chrome
  mientras dura la edición, viola SC-009 en el intervalo). Rechazado.
- **Clonar `ThemeStore` global**: el store es `providedIn: 'root'` y su
  `ThemeApplier` escribe a `:root` por diseño (`003`); reutilizarlo contaminaría
  el panel. El preview usa un aplicador **con scope** propio (`scoped-theme.ts`),
  no el store.

---

## D2. Validación de contraste WCAG AA (FR-008, SC-007)

**Decisión**: Calcular el **ratio de contraste WCAG 2.1** en-house
(`util/contrast-ratio.ts`): luminancia relativa de dos colores hex → ratio
`(L1+0.05)/(L2+0.05)`; se **advierte** (no bloquea) cuando un par
texto/superficie no alcanza **4.5:1** (AA texto normal). El `color-field` recibe
el color de superficie contra el que contrastar y emite un estado de advertencia.

**Rationale**:
- El algoritmo WCAG es aritmética determinista (~30 líneas); una librería
  (`wcag-contrast`, `color`) añadiría dependencia npm para algo trivial y
  contradice "cero dependencias nuevas".
- "Advertir sin bloquear" es exactamente lo que pide FR-008 y el escenario US3.2.

**Alternativas consideradas**:
- **Librería `wcag-contrast`/`chroma-js`**: innecesaria para el cálculo; peso de
  bundle y superficie de dependencias. Rechazada.
- **Bloquear la edición si no cumple**: contradice FR-008 ("sin bloquear
  necesariamente"). Rechazado.

---

## D3. Diseño del chrome del panel desde cero (Assumption "Diseño visual")

**Decisión**: El **chrome** del back office (nav lateral, cabecera, tablas,
formularios) se diseña desde cero con un **design language derivado del Figma
"Portal Médicos Cardif"** (BNP Paribas Cardif), compuesto de utilidades Tailwind
+ los átomos `shared/components/ui`. El Figma se usa **solo como guía de estilo**
(paleta, escala tipográfica, radios, sombras, tono) y como fuente de la
**pantalla de journey** ("Ofrecimiento del seguro / Personaliza tu seguro") que
sirve de **lienzo del preview**. No se copia ninguna pantalla de administración
del Figma porque no existe.

Los tokens concretos **extraídos del Figma** (fileKey `IFh82Sot5SsJyXFlrHeqxf`,
node `2842:172` — pantalla de login) están en
`contracts/admin-design-language.contract.md` y se resumen abajo.

**Rationale**:
- La spec (Assumptions) fija esta decisión; el chrome del panel es **neutral** e
  independiente de la marca del partner (que solo vive dentro del preview), pero
  ahora **anclado a la identidad visual BNP Paribas Cardif** del Figma aportado.
- Reutilizar los átomos `ui/` mantiene coherencia y cumple ARCHITECTURE §5.

**Alternativas consideradas**:
- **Introducir una librería de componentes admin (Material/PrimeNG)**: viola
  Const. IV (Tailwind único). Rechazado.
- **Esperar un Figma del panel**: no existe y bloquearía la entrega; la spec
  autoriza diseñar desde cero. Rechazado.

**Design tokens del chrome (BNP Paribas Cardif — NO confundir con `--brand-*`
del preview)**. Extraídos del Figma; detalle completo en
`contracts/admin-design-language.contract.md`:

| Rol | Token | Valor |
|-----|-------|-------|
| Acción primaria / marca del panel | `--admin-primary` | `#00965E` (verde BNP) |
| Acento secundario | `--admin-accent` | `#93BD0E` (verde claro) |
| Enlaces / info | `--admin-link` | `#00A2B5` (teal) |
| Texto fuerte | `--admin-text-strong` | `#333333` |
| Texto atenuado | `--admin-text-muted` | `#575451` / `#ABA9A8` |
| Placeholder | `--admin-placeholder` | `#BFBFBF` |
| Superficie | `--admin-surface` | `#FFFFFF` / `#FDFDFD` |
| Fondo sutil | `--admin-bg` | `#F5F5F5` / `#F3F3F3` |
| Borde de input | `--admin-border` | `#DADADA` |
| Tipografía | `--admin-font` | `"BNPP Sans"` (display: BNPP Sans Condensed), fallback `system-ui` |
| Radio card / input | — | `5px` card, `3px` input |
| Sombra card | — | `0 2px 5px rgba(0,0,0,0.2)` |

Estos `--admin-*` son el **chrome neutro** del panel; los `--brand-*` del partner
solo viven dentro del `theme-preview` (D1). Ambos conjuntos **nunca se mezclan**.

---

## D4. Picker de color (FR-007)

**Decisión**: El `color-field` envuelve `<input type="color">` **nativo** + un
input de texto hex sincronizados, como una **variante** del átomo de input de
`ui/`. Sin librería de color.

**Rationale**: nativo, accesible, cero dependencias; suficiente para editar los 8
tokens de color del contrato. Cumple ARCHITECTURE §5 (variante, no clases ad-hoc).

**Alternativas consideradas**: `ngx-color-picker`/`@ctrl/ngx-...` — dependencia
npm para algo que el navegador ya resuelve. Rechazado.

---

## D5. Estado de edición: signal local vs. SignalStore (Const. I/II)

**Decisión**: El **borrador en edición** (`ThemeDraft`) es **estado síncrono
local** del `partner-edit` (un `signal`/Reactive Form), del que derivan por
`computed()` los CSS vars del preview y el estado "dirty". **No** se crea un
SignalStore ni se guarda en TanStack Query hasta que el operador pulsa "Guardar"
(entonces sí, `injectMutation` → `PATCH`). El resultado de guardar/publicar sí es
server-state (TanStack Query).

**Rationale**:
- El borrador es efímero de una sola página → señal local basta (ARCHITECTURE §2:
  "el estado trivial de un solo componente sigue siendo una señal local").
- Guardar/publicar/listar es server-state → TanStack Query (Const. I/III).

**Alternativas consideradas**:
- **SignalStore para el borrador**: innecesario (no se comparte entre rutas);
  ARCHITECTURE §2 lo desaconseja. Rechazado.
- **Meter el borrador en TanStack Query**: es estado de UI, no de servidor; viola
  la separación de la Const. I. Rechazado.

---

## D6. Guard de rol y protección de la ruta (FR-003)

**Decisión**: La ruta `admin` se protege con la composición
`authGuard → roleGuard('admin')` (patrón ARCHITECTURE §4). El `roleGuard('admin')`
lee el rol del `AuthStore` y redirige a `/forbidden` (o crea `UrlTree`) si no
coincide. El **mecanismo real de identidad/SSO y la fuente del rol son PRD 06**;
esta feature **consume el seam** y asume su existencia (Assumption
"Autorización delegada"). En V1, mientras PRD 06 no conecte el IdP, el guard se
apoya en el estado del `AuthStore` disponible.

**Rationale**: la protección de acceso es requisito duro (FR-003, US1.3); el
detalle de identidad es de otra feature. Se define el seam sin adelantar PRD 06.

**Alternativas consideradas**:
- **Proteger solo en el BFF**: el `/api/admin/*` ya hace default-deny (`004`),
  pero la ruta front debe negar **antes de mostrar datos** (US1.3) → guard de
  ruta necesario además del server. Se hacen ambos (defensa en profundidad).

---

## D7. Buscador del listado: filtro cliente vs. servidor (FR-002, SC búsqueda)

**Decisión**: **Filtro en cliente** sobre la lista ya cacheada por TanStack
Query (por `displayName` o `slug`, sin recargar), con **estado vacío** explícito
cuando no hay coincidencias (Edge Case "búsqueda sin resultados"). Si el catálogo
crece, el `AdminApiService.listPartners` ya acepta `status`/paginación para mover
el filtro a servidor sin rediseñar el componente.

**Rationale**: US1.2 pide filtrado "sin recargar la página"; el volumen de
partners es bajo (decenas) → filtrar en memoria es instantáneo y simple.

**Alternativas consideradas**:
- **Refetch por tecla al servidor**: latencia y carga innecesarias para pocos
  registros. Rechazado para V1 (queda como ruta de escalado).

---

## D8. Flujo de guardar vs. publicar; concurrencia (FR-013/014, Edge Cases)

**Decisión**: **Guardar** (`PATCH /api/admin/partners/:id`) crea **siempre una
versión en borrador nueva** (el repositorio incrementa `version`, `002`), sin
mover el puntero vigente. **Publicar** (`POST …/:id/publish`) mueve `themeId` a la
versión elegida e invalida la caché pública (motor de `003`, sin redeploy). Tras
mutar, se **invalida** `['admin','partners']` y el detalle del partner en TanStack
Query. Ante error de red, la mutación expone estado de error claro (Edge Case
"pérdida de conexión") y no deja el UI en estado ambiguo (se reconsulta el
servidor como fuente de verdad). La **unicidad de slug** y las **carreras** las
resuelve el BFF/DB (`002`/`004`); el panel solo muestra el error de duplicado.

**Rationale**: alinea 1:1 con el contrato de endpoints admin (`004`) y el modelo
de versiones (`002`); el panel no reimplementa reglas de dominio, las consume.

**Alternativas consideradas**:
- **Optimistic updates** en el listado tras publicar/activar: mejora percepción
  pero añade complejidad de rollback; para V1 se prefiere invalidar + refetch
  (correcto y simple). Queda como mejora futura.

---

## Resumen de decisiones

| ID | Tema | Decisión |
|----|------|----------|
| D1 | Aislamiento preview | CSS custom properties en host con scope, reusando `toCssVars`; no `:root`, no store |
| D2 | Contraste AA | Cálculo WCAG en-house; advertir sin bloquear |
| D3 | Diseño del chrome | Desde cero, neutro, átomos `ui/`; Figma solo guía de estilo |
| D4 | Picker de color | `<input type="color">` nativo + hex, variante de `color-field` |
| D5 | Estado de edición | Signal local (borrador); TanStack Query solo al guardar/publicar |
| D6 | Guard de rol | `authGuard → roleGuard('admin')`; identidad = PRD 06 (seam) |
| D7 | Buscador | Filtro cliente sobre query cacheada; escalable a servidor |
| D8 | Guardar/Publicar | PATCH crea borrador; publish mueve puntero + invalida caché; unicidad = BFF |

Todas las **NEEDS CLARIFICATION** del Technical Context quedan resueltas. **Cero
dependencias npm nuevas**; **cero cambios en runtime servidor**.
