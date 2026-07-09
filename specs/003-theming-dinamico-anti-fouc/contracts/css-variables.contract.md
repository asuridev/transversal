# Contract — Tokens → CSS custom properties (`toCssVars`)

**Fuente de verdad** de cómo el `PublicTheme` (feature `002`) se proyecta a
variables CSS de marca que Tailwind v4 consume. Cumple FR-002, FR-003, FR-008,
SC-008 y la Constitución IV (Tailwind única, sin hex hardcodeado).

Ubicación de la función (pura, testeable con Karma+Jasmine sin DOM):
`src/app/core/theme/theme-css-vars.ts`.

## Firma

```typescript
export function toCssVars(theme: PublicTheme | null): Record<string, string>;
```

- `theme === null` ⇒ `{}` (mapa vacío). En SSR nunca se sirve `null`: siempre
  hay theme de partner o el default (`__default__`).
- Determinista y pura: mismas entradas ⇒ misma salida; sin efectos de borde.

## Mapa normativo (tokens base)

| Clave `PublicTheme` | Variable CSS emitida |
|---|---|
| `tokens.colorPrimary` | `--brand-primary` |
| `tokens.colorPrimaryTint` | `--brand-primary-tint` |
| `tokens.colorSecondary` | `--brand-secondary` |
| `tokens.colorSecondaryTint` | `--brand-secondary-tint` |
| `tokens.colorTextStrong` | `--brand-text-strong` |
| `tokens.colorTextMuted` | `--brand-text-muted` |
| `tokens.colorSurface` | `--brand-surface` |
| `tokens.colorBorder` | `--brand-border` |
| `typography.fontFamily` | `--brand-font-family` |

## Tokens aditivos (FR-006 de `002`)

`ThemeTokens` admite claves extra opcionales (`[extraToken: string]`). Cada clave
extra `fooBar` se emite como `--brand-foo-bar` (camelCase → kebab-case). Un token
extra desconocido **no** rompe el consumidor: se agrega como variable adicional
que las utilidades existentes ignoran hasta que un `@theme`/componente la use.

## Bloque `@theme` en `src/styles.css` (Tailwind v4)

```css
@import "tailwindcss";

@theme {
  --color-primary: var(--brand-primary);
  --color-primary-tint: var(--brand-primary-tint);
  --color-secondary: var(--brand-secondary);
  --color-secondary-tint: var(--brand-secondary-tint);
  --color-text-strong: var(--brand-text-strong);
  --color-text-muted: var(--brand-text-muted);
  --color-surface: var(--brand-surface);
  --color-border: var(--brand-border);
  --font-brand: var(--brand-font-family), system-ui, sans-serif;
}

/* Neutros de arranque para --brand-* (evitan variable sin valor antes de aplicar
   el theme; en SSR el resolver los sobre-escribe inline con la marca real). */
:root {
  --brand-primary: #1f2937;
  --brand-primary-tint: #e5e7eb;
  --brand-secondary: #4b5563;
  --brand-secondary-tint: #f3f4f6;
  --brand-text-strong: #111827;
  --brand-text-muted: #6b7280;
  --brand-surface: #ffffff;
  --brand-border: #d1d5db;
  --brand-font-family: "Poppins";
}
```

Los componentes usan **solo** utilidades derivadas: `bg-primary`,
`text-text-strong`, `border-border`, `font-brand`, etc. — **nunca** un hex
literal ni `style="color:#..."` para marca (SC-008; ver
`contracts/component-branding.contract.md` si se añade).

## Escritura en `:root` (cliente)

El `theme-applier` (§D6 research) escribe el mapa devuelto por `toCssVars` en
`document.documentElement.style`:

```typescript
for (const [prop, value] of Object.entries(cssVars())) {
  doc.documentElement.style.setProperty(prop, value);
}
```

En SSR, ese mismo mapa se serializa **inline** en el HTML inicial (atributo
`style` de `:root`/`<html>` o un `<style>` en `<head>`) para que el primer paint
ya traiga la marca (anti-FOUC, FR-006). El `effect` de cliente escribe los mismos
valores ⇒ operación idempotente, sin parpadeo en hidratación (SC-002).

## Propiedad de test (contract)

1. Para `PublicTheme` de **Banco Popular** (verde) y **Banco Occidente** (azul),
   `toCssVars` produce mapas con las **mismas 9 claves** y valores distintos
   (FR-015, SC-004).
2. Toda clave del mapa empieza por `--brand-`.
3. `toCssVars(null) === {}`.
4. Un token aditivo `tokens.accentHover` ⇒ el mapa incluye `--brand-accent-hover`.
5. Ningún valor del mapa se pierde ni se transforma (colores pasan verbatim).
