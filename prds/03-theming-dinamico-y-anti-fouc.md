# PRD 03 — Theming Dinámico y Anti-FOUC

> **Depende de:** [01 Tenant/Routing](./01-resolucion-de-tenant-y-routing.md)
> (provee `partnerSlug`), [02 Modelo/Theme](./02-modelo-de-partner-y-contrato-de-theme.md)
> (provee el contrato `PartnerTheme`).
> **Habilita:** [05 Back Office](./05-back-office-gestion-de-partners.md)
> (preview reutiliza este motor).

---

## 1. Objetivo

Definir **cómo el front aplica dinámicamente el branding de un partner** —
colores, logo, favicon, tipografía, footer co-branded, textos legales — a
partir del contrato `PartnerTheme` (PRD 02), **sin flash de estilos sin marca
(FOUC)**, con caché eficiente y respetando la stack del proyecto (Tailwind v4,
NgRx Signals, TanStack Query, zoneless).

---

## 2. Principio: tokens → CSS custom properties

El branding se aplica como **CSS custom properties** en `:root` (o en el host
de la app), y Tailwind v4 consume esas variables. Así, cambiar de partner es
**cambiar valores de variables**, no clases ni recompilar.

```css
/* styles.css — Tailwind v4 (@theme mapea tokens a utilidades) */
@import "tailwindcss";

@theme {
  --color-primary: var(--brand-primary);
  --color-primary-tint: var(--brand-primary-tint);
  --color-secondary: var(--brand-secondary);
  --color-secondary-tint: var(--brand-secondary-tint);
  --color-surface: var(--brand-surface);
  --color-border: var(--brand-border);
  --font-brand: var(--brand-font-family);
}
```

```css
/* valores por partner, inyectados dinámicamente (ver §4/§5) */
:root {
  --brand-primary: #00947F;
  --brand-primary-tint: #E0F4ED;
  --brand-secondary: #105163;
  --brand-secondary-tint: #CCD3DB;
  --brand-surface: #FFFFFF;
  --brand-border: #EBEBEB;
  --brand-font-family: "Inter", system-ui, sans-serif;
}
```

Los componentes usan utilidades Tailwind (`bg-primary`, `text-secondary`,
`border-border`, `font-brand`) — **nunca** hex hardcodeado (Constitución
regla 14, `ARCHITECTURE.md` §5/§10). Un componente `ui/` (átomo) encapsula la
apariencia; variar la marca no toca su template, solo las variables.

> Los valores del ejemplo son los **tokens reales** del Figma de referencia.

---

## 3. Estado del theme — `ThemeStore` (NgRx Signals, síncrono)

El theme resuelto es **estado síncrono de UI transversal** (no pertenece a un
feature), por lo que vive en `core/store/theme.store.ts`
(`ARCHITECTURE.md` §2, Constitución regla 2). **No** modela datos de servidor
(eso lo hace TanStack Query, §6).

```typescript
// core/store/theme.store.ts (conceptual)
export const ThemeStore = signalStore(
  { providedIn: 'root' },
  withState({ theme: null as PublicPartnerTheme | null }),
  withComputed(({ theme }) => ({
    isBranded: computed(() => theme() !== null),
    cssVars: computed(() => toCssVars(theme())), // tokens → { '--brand-...': value }
  })),
  withMethods((store) => ({
    apply(theme: PublicPartnerTheme): void { patchState(store, { theme }); },
    reset(): void { patchState(store, { theme: null }); }, // → theme default
  }))
);
```

- `apply()` se llama desde el `onSuccess` de la query de theme (§6) o desde el
  estado inyectado por SSR (§5).
- Un efecto (signal `effect`) escribe las `cssVars` en el `:root` y actualiza
  `<link rel="icon">`/`<title>`/`<meta>` según el theme.

---

## 4. Flujo de aplicación del theme

```
URL (partnerSlug, PRD 01)
      │
      ▼
themeResolver / SSR  ──►  BFF GET /api/theme/:slug (PRD 04)  ──►  PartnerTheme público (PRD 02)
      │                                                               │
      ▼                                                               ▼
ThemeStore.apply(theme)  ──►  effect escribe CSS vars + favicon + title + fuente
      │
      ▼
Tailwind pinta la experiencia con la marca del partner (sin FOUC, §5)
```

---

## 5. Anti-FOUC vía SSR (decisión 2, PRD 00)

**El FOUC ocurre** cuando el HTML llega sin marca y el theme se aplica después
en el cliente (parpadeo de colores/logo por defecto → marca). Se elimina así:

1. **Resolución en servidor:** durante el SSR (Angular SSR = el BFF), el server
   ya conoce el `partnerSlug`, pide el theme (con caché server-side, §6) y
   **renderiza el HTML inicial ya con las CSS custom properties inline** en el
   `<head>`/`:root` y el `<link rel="icon">`/`<title>` correctos.
2. **Transferencia de estado:** el theme resuelto viaja al cliente vía
   `TransferState` de Angular, de modo que el cliente **hidrata con el mismo
   theme** sin re-fetch ni recálculo → cero parpadeo.
3. **Fuente tipográfica:** se hace `preload` de la fuente del partner en SSR
   (`<link rel="preload" as="font">`) y se aplica `font-display: swap` para
   evitar bloqueo de render.
4. **Fallback:** si el slug no resuelve, el server ya inyecta el **theme
   default** (PRD 01 §5 / PRD 02 §6): tampoco hay parpadeo.

> Criterio duro (PRD 00 §8): **FOUC = 0**. El primer paint ya trae la marca.

---

## 6. Caché del theme — TanStack Query (estado de servidor)

El theme es **estado de servidor** ⇒ se gestiona con TanStack Query
(`@tanstack/angular-query-experimental`), único mecanismo permitido
(Constitución regla 3, `ARCHITECTURE.md` §3). **No** se cachea en el
`ThemeStore` (ese solo refleja el theme activo para la UI).

```typescript
// features/theming/queries/theme-queries.ts (conceptual)
@Injectable({ providedIn: 'root' })
export class ThemeQueries {
  private api = inject(ThemeApiService); // envuelve HttpClient → BFF
  bySlug(slug: string) {
    return queryOptions({
      queryKey: ['theme', slug],
      queryFn: () => this.api.getTheme(slug),
      staleTime: 5 * 60_000,   // 5 min: el theme cambia poco
      gcTime: 30 * 60_000,
    });
  }
  activePartners() {
    return queryOptions({
      queryKey: ['partners', 'active'],  // lista para el resolver (PRD 01)
      queryFn: () => this.api.getActivePartners(),
      staleTime: 5 * 60_000,
    });
  }
}
```

Capas de caché:
- **Cliente:** TanStack Query (memoria) → navegación SPA entre pasos del journey
  **no** re-pide el theme (PRD 01 §9).
- **Server (BFF):** caché en memoria/edge del theme por slug + `Cache-Control`
  para CDN (PRD 04). El front nunca golpea Mashery por cada request.
- **Invalidación:** al publicar un cambio en el Back Office (PRD 05), se
  invalida `['theme', slug]` y la caché server/CDN correspondiente
  (`version` del theme cambia → cache-busting natural).

---

## 7. Requisitos funcionales

- **RF-03.1** Los tokens del `PartnerTheme` se aplican como CSS custom
  properties consumidas por Tailwind v4.
- **RF-03.2** Logo, favicon, title, footer co-branded y textos legales se
  setean según el theme del partner activo.
- **RF-03.3** El theme se resuelve en SSR e hidrata vía `TransferState` → FOUC
  = 0.
- **RF-03.4** El theme se cachea (cliente + server/CDN); la navegación SPA no
  re-fetchea.
- **RF-03.5** Publicar un cambio invalida la caché y actualiza la experiencia
  sin deploy.
- **RF-03.6** Fallback a theme default sin parpadeo cuando el slug no resuelve.
- **RF-03.7** Ningún color/asset de marca se hardcodea en componentes; todo vía
  variables (Constitución regla 11/14).

---

## 8. Criterios de aceptación

- [ ] Cargar `app.com/popular/oferta` muestra el primer paint **ya** con
      colores/logo de Banco Popular (sin flash de marca default).
- [ ] Cambiar de paso del journey no dispara una nueva request de theme.
- [ ] Publicar un cambio de color en el Back Office se refleja en la
      experiencia tras invalidación, sin redeploy.
- [ ] Un slug inexistente muestra theme default sin parpadeo.
- [ ] El favicon y el `<title>` corresponden al partner activo.
- [ ] Auditoría visual con Playwright CLI (`TOOLS.md`) confirma ausencia de
      FOUC entre SSR y hidratación.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Parpadeo por fuente custom tardía | `preload` en SSR + `font-display: swap`. |
| Desalineación de tokens server vs client | Mismo contrato + `TransferState` (misma data). |
| Caché sirviendo theme viejo tras publicar | Invalidación por `version` + `Cache-Control` con revalidación. |
| Contraste insuficiente con colores de un banco | Validación de contraste (WCAG) en el editor (PRD 05). |
