const HEX_RE = /^#?[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

/** Hex válido (3 o 6 dígitos, `#` opcional). Los themes pueden traer colores sin
 * definir (null/undefined) o parciales; validar antes de parsear evita el crash. */
function isValidHex(hex: unknown): hex is string {
  return typeof hex === 'string' && HEX_RE.test(hex.trim());
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.1 entre dos colores hex, en el rango 1..21 (D2).
 * Si algún color falta o es inválido (theme parcial), devuelve 21 (máximo contraste):
 * neutral — no revienta la CD ni produce advertencias espurias; los consumidores
 * que muestran la advertencia ya validan el hex por su cuenta antes de mostrarla. */
export function contrastRatio(hexA: string, hexB: string): number {
  if (!isValidHex(hexA) || !isValidHex(hexB)) {
    return 21;
  }
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Veredicto AA — 4.5:1 texto normal, 3.0:1 texto grande (WCAG 2.1). */
export function meetsAA(ratio: number, largeText = false): boolean {
  return ratio >= (largeText ? 3.0 : 4.5);
}
