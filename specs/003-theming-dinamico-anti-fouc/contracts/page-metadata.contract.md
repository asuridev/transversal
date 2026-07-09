# Contract — Metadatos de página y aplicación al DOM (`theme-applier`)

Define **qué** metadatos de página derivan del theme activo y **cómo** se
escriben al DOM de forma zoneless e idempotente. Cumple FR-004, FR-008, FR-017,
SC-007, SC-002.

Ubicación: `src/app/core/theme/theme-applier.ts` (servicio raíz que crea un
`effect` reactivo al `ThemeStore`), consumido/instanciado en el `App` root.

## Reacción

Un único `effect` reacciona a `ThemeStore.theme()` / `ThemeStore.cssVars()` y
escribe, en este orden:

| # | Destino DOM | Fuente | Nota |
|---|---|---|---|
| 1 | `:root` `--brand-*` | `cssVars()` (ver `css-variables.contract.md`) | `documentElement.style.setProperty` |
| 2 | `<link rel="icon">` | `assets.faviconUrl` | crea/actualiza el link; si falla la carga, mantiene el anterior (FR-017) |
| 3 | `document.title` | `displayName` (+ sufijo de paso si aplica) | vía `Title` de `@angular/platform-browser` |
| 4 | `<link rel="preload" as="font">` | `typography.fontUrlWoff2?` | solo si existe; `crossorigin`, `type="font/woff2"` (FR-008) |
| 5 | `<meta property="og:image">` | `assets.ogImageUrl?` | opcional; vía `Meta` |

## Reglas

- **Zoneless** (Constitución IV): la escritura ocurre dentro de un `effect`
  (signals), **nunca** por detección implícita, `NgZone` ni `@HostBinding`.
- **`inject()`** para `DOCUMENT`, `Title`, `Meta` (Constitución III).
- **Idempotencia**: en SSR estos metadatos ya se emiten en el HTML inicial; el
  `effect` de cliente escribe los mismos valores ⇒ sin parpadeo en hidratación
  (SC-002).
- **SSR-safe**: usa `DOCUMENT` inyectado (no `window`/`document` global) para que
  el mismo applier corra en servidor y navegador.
- **Resiliencia de assets** (FR-017): favicon/fuente que no cargan degradan al
  valor previo/de sistema sin abortar el resto del branding; un `<img>` de logo
  roto se oculta sin romper layout. La ausencia de un binario **no** provoca
  parpadeo del conjunto.

## Tipografía (FR-008, D7)

- Si `typography.fontUrlWoff2` existe: `preload` en `<head>` (SSR) + `@font-face`
  con `font-display: swap`. La familia se referencia por `--brand-font-family`
  (→ utilidad `font-brand`).
- Si no hay fuente custom: `--brand-font-family` usa la familia declarada como
  nombre de sistema/fallback; sin `preload`.
- Nunca `font-display: block` (bloquearía el render, viola FR-008).

## Propiedades de test (contract, `DOCUMENT` mockeado)

1. Aplicar el theme de Banco Popular ⇒ `document.title` = "Banco Popular" y
   `<link rel="icon">.href` = `assets.faviconUrl` (SC-007).
2. Cambiar de theme (Popular → Occidente) ⇒ favicon y title se actualizan a los
   del nuevo partner; sin residuos del anterior (SC-004).
3. Theme con `fontUrlWoff2` ⇒ existe un `<link rel="preload" as="font">` con esa
   URL; sin `fontUrlWoff2` ⇒ no se crea preload.
4. Aplicar dos veces el mismo theme ⇒ no duplica `<link>`/`<meta>` (idempotente).
5. `faviconUrl` inválido no lanza excepción ni borra el resto de las CSS vars
   aplicadas (FR-017).
