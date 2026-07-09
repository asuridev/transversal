const SCRIPT_TAG_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const EVENT_ATTR_PATTERN = /\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi;
const DANGEROUS_HREF_PATTERN = /((?:xlink:)?href\s*=\s*)("|')\s*javascript:[^"']*\2/gi;

/**
 * Sanitiza un SVG eliminando `<script>`, atributos `on*` y `href`/`xlink:href`
 * con esquema `javascript:` (FR-016). No usa un parser XML — es una defensa en
 * profundidad previa a servir el asset; la subida real es PRD 04.
 */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(SCRIPT_TAG_PATTERN, '')
    .replace(EVENT_ATTR_PATTERN, '')
    .replace(DANGEROUS_HREF_PATTERN, '$1$2$2');
}

export function isSvgDangerous(svg: string): boolean {
  return (
    /<script\b/i.test(svg) ||
    /\son\w+\s*=/i.test(svg) ||
    /(?:xlink:)?href\s*=\s*("|')\s*javascript:/i.test(svg)
  );
}
