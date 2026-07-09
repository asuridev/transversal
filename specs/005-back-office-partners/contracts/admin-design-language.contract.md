# Contract — Design language del chrome del panel (BNP Paribas Cardif)

Tokens visuales del **chrome** del back office, extraídos del Figma "Portal
Médicos Cardif" (guía de estilo, Assumption "Diseño visual"; PRD 05 §1). Fuente:
`figma.com/design/IFh82Sot5SsJyXFlrHeqxf`, node `2842:172` (pantalla de login) —
única pantalla disponible; el back office **no** existe en Figma y se diseña
desde cero con esta paleta/tipografía.

> **Separación crítica (SC-009, D1/D3)**: estos `--admin-*` visten **solo** el
> chrome del panel (nav, tablas, formularios del editor). Son **independientes**
> de los `--brand-*` del partner, que viven **exclusivamente** dentro del
> `theme-preview` aislado. Un token nunca cruza al otro conjunto.

---

## Paleta (extraída de variables + fills del Figma)

| Rol en el panel | Hex | Origen Figma |
|-----------------|-----|--------------|
| **Primario / marca** (header, botón primario, headings, borde activo, labels) | `#00965E` | fill header/footer/botón "Ingresar"/"Inicia sesión" |
| **Acento** (destacados, banda hero) | `#93BD0E` | "Secundarios / Verde Claro" |
| **Enlace / info** | `#00A2B5` | links "Autorizaciones", chip de usuario |
| **Texto fuerte** | `#333333` | "Grises / Semi Dark" |
| **Texto atenuado (fuerte)** | `#575451` | "Primarios / Dark 80%" |
| **Texto atenuado (suave)** | `#ABA9A8` | "Primarios / Dark 40%" |
| **Placeholder / deshabilitado** | `#BFBFBF` | "Primarios / Medium 40%" |
| **Superficie (card/panel)** | `#FFFFFF` | "B&N / Blanco" |
| **Superficie sutil** | `#FDFDFD` | "Primarios / light 20%" |
| **Fondo de app** | `#F5F5F5` | "Primarios / light 80%" |
| **Fondo alterno / footer** | `#F3F3F3` | "Primarios / light" |
| **Borde de input** | `#DADADA` | borde de inputs del login |
| **Texto sobre primario** | `#FDFDFD` / `#FFFFFF` | texto del botón/header |

## Tipografía

- **Familia**: `"BNPP Sans"` (cuerpo/labels), `"BNPP Sans Condensed"` (display /
  headings de hero). Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.
  Si el binario de la fuente no está licenciado/disponible en el bundle, se usa el
  fallback sin romper el layout (la fuente es de marca, no funcional).
- **Escala** (de las variables del Figma):

| Nivel | Peso / tamaño / línea | Tracking |
|-------|-----------------------|----------|
| Display (hero) | Bold 48 / 50 (Condensed) | -0.07px |
| Heading 2 | Bold 30 / 34 | -0.07px |
| Body / Subparagraph | Regular 14 / 24 | -0.027px |
| Label | Regular 15 / 1.0 | -0.029px |
| Placeholder | Regular 16 / 1.0 | -0.031px |
| Small (bold) | Bold 12 / 20 | -0.023px |

## Forma y elevación

- **Card / panel**: radio `5px`, sombra `0 2px 5px rgba(0,0,0,0.2)`.
- **Input**: radio `3px`, borde `1px #DADADA`, alto ~`42px`, foco → borde
  `#00965E`.
- **Botón primario**: fondo `#00965E`, texto blanco, padding `18px 36px`, esquinas
  rectas (radio ~0–2px como en el Figma); hover/disabled derivan de `#00965E`.

---

## Materialización en Tailwind v4 (Const. IV — Tailwind único)

Los tokens se declaran una vez como custom properties del tema (en `styles.css`,
bloque `@theme`), y se consumen como utilidades Tailwind. **No** se introduce otra
librería CSS ni componentes de terceros.

```css
/* src/styles.css — @theme del chrome admin (NO son los --brand-* del preview) */
@theme {
  --color-admin-primary: #00965E;
  --color-admin-accent:  #93BD0E;
  --color-admin-link:    #00A2B5;
  --color-admin-text-strong: #333333;
  --color-admin-text-muted:  #575451;
  --color-admin-text-soft:   #ABA9A8;
  --color-admin-placeholder: #BFBFBF;
  --color-admin-surface: #FFFFFF;
  --color-admin-surface-2: #FDFDFD;
  --color-admin-bg:      #F5F5F5;
  --color-admin-bg-2:    #F3F3F3;
  --color-admin-border:  #DADADA;
  --font-admin: "BNPP Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

Uso: `bg-admin-primary`, `text-admin-text-strong`, `border-admin-border`,
`font-admin`, `rounded-[5px]`, `shadow-[0_2px_5px_rgba(0,0,0,0.2)]`.

Los **átomos `shared/components/ui`** encapsulan estas clases como **variantes**
(ARCHITECTURE §5): p. ej. una variante `admin`/`primary` del botón usa
`bg-admin-primary`; el `color-field`/inputs del editor usan
`border-admin-border` + foco `border-admin-primary`. **Nunca** clases ad-hoc en
templates de feature (Const. 11).

---

## Aplicación por zona del panel

| Zona | Tokens |
|------|--------|
| Barra superior / nav lateral | `bg-admin-primary` + texto `#FDFDFD`; logo BNP Paribas Cardif |
| Fondo del contenido | `bg-admin-bg` (`#F5F5F5`) |
| Cards (listado, editor, preview frame) | `bg-admin-surface`, `rounded-[5px]`, sombra card |
| Tabla de partners | filas sobre `surface`; badge estado: activo `admin-primary`, inactivo `admin-text-soft` |
| Botones primarios ("Nuevo partner", "Guardar", "Publicar") | variante `admin-primary` |
| Enlaces / acciones secundarias | `text-admin-link` |
| Inputs / `color-field` / textarea | borde `admin-border`, label `admin-primary`, placeholder `admin-placeholder`, foco `admin-primary` |

---

## Acceptance

1. `styles.css` declara los `--color-admin-*` y `--font-admin` en `@theme`; el
   chrome usa solo utilidades Tailwind derivadas (Const. IV). Sin librería CSS ni
   de componentes nueva.
2. El chrome del panel usa `#00965E` como color de marca (header/nav, botones
   primarios, headings) y la jerarquía de grises del Figma para texto/superficies.
3. Los `--admin-*` **no** aparecen dentro del `theme-preview` y los `--brand-*`
   del partner **no** aparecen en el chrome (verificable: el preview aislado no
   hereda `--admin-*` como marca, y editar la marca no cambia el chrome — SC-009).
4. Tipografía `"BNPP Sans"` con fallback `system-ui`; el layout no se rompe si la
   fuente de marca no está disponible.
5. Los átomos exponen la apariencia como **variante** (`input()`), no como clases
   Tailwind ad-hoc en templates de feature (Const. 11; ARCHITECTURE §5).
```
