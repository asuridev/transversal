/**
 * Aplica tokens `--brand-*` como propiedades inline en el `host` dado —
 * NUNCA en `document.documentElement` (`:root`) ni en `ThemeStore`/`ThemeApplier`
 * globales (FR-011, SC-009, D1). Las CSS custom properties heredan por el
 * subárbol del `host`, aislando el preview del chrome del panel.
 */
export function applyScopedTheme(host: HTMLElement, cssVars: Record<string, string>): void {
  for (const [name, value] of Object.entries(cssVars)) {
    host.style.setProperty(name, value);
  }
}
