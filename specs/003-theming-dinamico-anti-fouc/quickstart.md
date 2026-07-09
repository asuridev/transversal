# Quickstart — Theming Dinámico y Anti-FOUC

**Feature**: `003-theming-dinamico-anti-fouc`

Guía de **validación** ejecutable: prueba que el branding del partner se aplica
sin FOUC de punta a punta. No es guía de implementación (eso es `tasks.md`); son
escenarios runnables que prueban la feature.

Referencias: `contracts/theme-transfer.contract.md`,
`contracts/css-variables.contract.md`, `contracts/page-metadata.contract.md`,
`contracts/fouc-visual-audit.contract.md`, `data-model.md`.

## Prerrequisitos

- Node 22.20, dependencias instaladas (`npm ci`).
- **SSR habilitado** en el proyecto (wiring de esta feature: `@angular/ssr`,
  `src/main.server.ts`, `src/server.ts`, opciones `server`/`ssr`/`outputMode` en
  `angular.json`).
- Datos de branding disponibles para el resolver SSR in-process (feature `002`):
  **Banco Popular** (verde), **Banco Occidente** (azul) y el partner
  `__default__`. Fixtures en `src/server/persistence/__fixtures__/brands.ts`.

## 1. Unit tests (Karma + Jasmine) — lógica pura y de aplicación

```bash
npm test
```

Cubre (todos `*.spec.ts` junto al fuente):

- `theme-css-vars.spec.ts` — `toCssVars`: mapa de 9 claves `--brand-*`, tokens
  aditivos, `null → {}`, Popular vs Occidente (contract css-variables).
- `theme.store.spec.ts` — `apply`/`reset`, `isBranded`, `cssVars` derivado.
- `theme-applier.spec.ts` — con `DOCUMENT` mockeado: escribe CSS vars, favicon,
  title, preload de fuente; idempotencia; resiliencia de asset roto
  (contract page-metadata).
- `resolve-active-theme.spec.ts` — partner→su theme, fallback/root/reserved→
  default indistinguible, partner sin theme publicado→default (contract
  theme-transfer §5).

## 2. Server tests (node:test) — resolver server-side

```bash
npm run test:server
```

Verifica que el resolver server-side obtiene el `PublicTheme` correcto del
`PartnerRepository` in-process y proyecta el default en fallback, sin filtrar
campos internos (reusa el contrato público de `002`).

## 3. Build + arranque SSR

```bash
npm run build
npm run serve:ssr        # sirve el bundle SSR (script añadido por el wiring SSR)
```

Verificación rápida (el primer HTML ya trae la marca — anti-FOUC):

```bash
# El HTML servido para un partner debe traer las CSS vars y el title inline
curl -s http://localhost:4000/popular/oferta | grep -Eo -- '--brand-primary:[^;\"]*|<title>[^<]*</title>'
```

**Esperado**: aparece `--brand-primary` con el verde de Popular y
`<title>Banco Popular…</title>` en el HTML **antes** de cualquier JS. Para un
slug no servible, aparece el neutro del theme default.

## 4. Auditoría visual anti-FOUC con Playwright CLI

Herramienta de verificación del agente (`TOOLS.md`,
`contracts/fouc-visual-audit.contract.md`) — no es suite de CI. Contra el server
SSR del paso 3, ejecutar los escenarios A–F del contrato:

- **A** FOUC=0 en primer paint de Popular (primer render == interactivo).
- **B** Popular (verde) vs Occidente (azul) sin mezcla de marca.
- **C** Navegar oferta→formulario→confirmación sin nuevas requests de branding.
- **D** slug inexistente / inactivo / raíz → mismo theme default sin parpadeo.
- **E** favicon y `<title>` del partner activo en cada carga.
- **F** fuente custom sin bloqueo ni salto (`preload` + `swap`).

Evidencia: screenshots antes/después de hidratar + logs de red por escenario.

## Mapa escenario → criterio

| Paso | Cubre |
|------|-------|
| 1 `theme-css-vars` / `theme-applier` | SC-008, FR-002/003/004, FR-017 |
| 1/2 `resolve-active-theme` | FR-016, SC-006 (fallback indistinguible) |
| 3 `curl` HTML SSR | FR-006 (primer paint con marca) |
| 4.A | SC-001, SC-002 (FOUC=0, sin cambio de marca) |
| 4.B | SC-004 (dos marcas opuestas sin mezcla) |
| 4.C | SC-003 (navegación sin re-fetch) |
| 4.D | SC-006 (fallback sin parpadeo) |
| 4.E | SC-007 (favicon/title del partner) |
| 4.F | FR-008 (tipografía sin bloqueo) |

## Fuera de alcance (no validar aquí)

- Endpoint HTTP del BFF `GET /api/theme/:slug` y su `Cache-Control`/CDN → **PRD 04**.
- Publicación/invalidación real desde Back Office → **PRD 05**. Esta feature deja
  la caché keyeada por `version` (cache-busting); la validación de "publicar sin
  redeploy" end-to-end se completa cuando existan BFF + Back Office.
