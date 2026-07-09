# Contract — Auditoría visual anti-FOUC (Playwright CLI)

Define la **validación funcional** de la feature mediante la **Playwright CLI**
(skill `.claude/skills/playwright-cli/`, `TOOLS.md`) como herramienta de
verificación del agente — **no** como framework de pruebas del proyecto
(`ARCHITECTURE §9`). Cubre SC-001, SC-002, SC-003, SC-004, SC-006, SC-007.

> La suite automatizada de CI sigue siendo **Karma + Jasmine** (unit de
> `toCssVars`, `ThemeStore`, `theme-applier`, resolver server-side). Playwright
> CLI aquí es auditoría visual manual/exploratoria del agente contra el server
> SSR levantado; no se añade Playwright como dependencia npm ni como suite del
> proyecto.

## Precondición

- Server **SSR** construido y sirviendo (`npm run build && npm run serve:ssr`
  o el dev-server con SSR habilitado), con datos de al menos **Banco Popular**
  (verde), **Banco Occidente** (azul) y el partner `__default__` (fallback).

## Escenarios

### A. FOUC = 0 en primer paint de partner (SC-001, SC-002)

1. Navegar a `/<popular>/oferta`.
2. Capturar el **HTML/screenshot inicial** (antes de que el JS hidrate) y
   verificar que `:root` ya trae `--brand-primary` verde, el logo, el favicon y
   el `<title>` de Banco Popular **inline** (sin marca default).
3. Esperar a `networkidle`/hidratación e interactuar; capturar de nuevo.
4. **Assert**: colores, logo, favicon y title son **idénticos** antes y después
   (cero cambio de marca ⇒ FOUC = 0). Ninguna captura muestra la marca neutra.

### B. Dos marcas opuestas sin mezcla (SC-004)

1. Cargar `/<popular>/...` y `/<occidente>/...` en contextos separados.
2. **Assert**: cada experiencia refleja el 100% de su marca
   (`--brand-primary` verde vs azul, logos/favicons/legales propios); ningún
   valor de un partner aparece en el otro.

### C. Navegación sin re-pedir branding (SC-003)

1. Cargar `/<popular>/oferta`, registrar las requests de red.
2. Navegar (SPA) a `/<popular>/formulario` → `/<popular>/confirmacion`.
3. **Assert**: **cero** nuevas requests de branding para ese partner tras la
   primera resolución; la marca se mantiene estable (sin volver a default).

### D. Fallback indistinguible sin parpadeo (SC-006)

1. Cargar un `slug` inexistente, uno de partner inactivo y la raíz `/`.
2. **Assert**: los tres muestran el **mismo** theme default neutro en el primer
   paint, sin flash de otra marca y sin pistas sobre existencia de partners.

### E. Favicon y título del partner activo (SC-007)

1. Cargar `/<partner>/...` para cada partner servible.
2. **Assert**: `<link rel="icon">` y `document.title` corresponden al partner en
   el 100% de las cargas.

### F. Tipografía sin bloqueo/salto (FR-008)

1. Cargar un partner con fuente custom.
2. **Assert**: el texto es visible durante la carga de la fuente (no bloquea) y
   no hay salto de estilos perceptible (existe `preload` + `font-display: swap`).

## Salida esperada

Evidencia visual (screenshots antes/después) y logs de red que confirmen, por
escenario, el criterio de aceptación correspondiente del PRD §8 y los
Success Criteria del spec. Los pasos runnables concretos viven en `quickstart.md`.
