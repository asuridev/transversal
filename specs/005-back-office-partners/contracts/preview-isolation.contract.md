# Contract — Preview en vivo aislado (`theme-preview` + `scoped-theme`)

La pieza clave del panel (PRD 05 §7). Garantiza que la marca en edición se vea
**instantáneamente** sobre una pantalla real del journey **sin ensuciar** el
chrome del back office. Cubre FR-010, FR-011, FR-012 y SC-002, SC-009.

---

## `scoped-theme.ts` (utilidad de aislamiento)

```typescript
// Escribe los tokens del borrador como CSS custom properties INLINE en el host
// dado — NUNCA en document.documentElement (:root).
export function applyScopedTheme(host: HTMLElement, cssVars: Record<string, string>): void;
```

Reglas:
- Reutiliza `toCssVars` de `src/app/core/theme/theme-css-vars.ts` (`003`) para
  proyectar `ThemeDraft.tokens` → `--brand-*` (misma proyección que producción).
- Escribe con `host.style.setProperty('--brand-...', value)` sobre el **host del
  contenedor de preview**. Prohibido tocar `document.documentElement`,
  `document.body`, `ThemeStore` o `ThemeApplier` global.
- SSR-safe: el preview es interacción client-side; si corriera en server, opera
  sobre el elemento inyectado, nunca sobre `document` global.

## `theme-preview` (componente)

- `input()` con el `ThemeDraft` (o su `previewCssVars` ya computado).
- En un `effect()` zoneless, reaplica `applyScopedTheme(hostRef, cssVars)` cada
  vez que el borrador cambia → actualización **<1 s, percibida instantánea**
  (SC-002), sin round-trip ni recarga.
- Dentro del host renderiza los **mismos átomos** que la experiencia real:
  `brand-logo`, `brand-footer` (`features/theming/components/`, `003`) y
  botones/cards de `shared/components/ui` — todos leen `--brand-*` por herencia,
  heredando las del host del preview (no las de `:root`).
- El lienzo reproduce la pantalla "Ofrecimiento del seguro / Personaliza tu
  seguro" (header con logo, botones primarios, cards tint, footer co-branded con
  disclaimer) — la misma que sirve de referencia visual en el Figma.

---

## Garantía de aislamiento (SC-009, FR-011)

Las CSS custom properties **heredan hacia abajo** y no afectan a ancestros ni
hermanos. Definidas en el host del preview:
- El subárbol del preview ve los `--brand-*` del borrador.
- El resto del panel (nav, tablas, formularios del editor) conserva sus tokens
  neutros del chrome (D3) — **intacto**.

Prohibiciones explícitas (verificables en test):
- El preview **no** llama a `ThemeStore`/`ThemeApplier` (que escriben a `:root`).
- El preview **no** modifica `document.documentElement.style`.

---

## Acceptance

1. Cambiar `colorPrimary` en el `brand-editor` actualiza el preview
   inmediatamente, **sin** guardar ni publicar (FR-010, US3.1).
2. Tras aplicar cualquier borrador, `getComputedStyle(document.documentElement)
   .getPropertyValue('--brand-primary')` **no cambia** respecto al chrome del
   panel (aislamiento, SC-009, US3.4). Test unit de `applyScopedTheme`: escribe
   en el host pasado, deja `:root` sin tocar.
3. El preview usa los mismos átomos que la experiencia real (import de
   `brand-logo`/`brand-footer`/`ui`), garantizando fidelidad (PRD 05 §10).
4. Un color de texto sin contraste AA contra su superficie dispara la advertencia
   del `color-field` pero **no** impide que el preview se renderice (FR-008, se
   detalla en `brand-editor-form.contract.md`).
5. El preview se actualiza vía signals + `OnPush` sin `NgZone`/`zone.js`
   (zoneless, Const. IV).
