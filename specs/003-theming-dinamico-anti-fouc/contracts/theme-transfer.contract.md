# Contract — Resolución SSR, `TransferState` y caché de theme

Define **cómo** el theme se resuelve en servidor, viaja al cliente sin re-fetch,
y se cachea por versión. Cumple FR-006, FR-007, FR-010..FR-014, SC-002, SC-003,
SC-005. Marca explícitamente la **frontera con PRD 04** (transporte BFF).

## 1. Resolución server-side (SSR)

Un resolver/inicializador server-side toma la `TenantResolution` (feature `001`)
y devuelve el `PublicTheme` a pintar:

```typescript
// conceptual — src/app/core/theme/resolve-active-theme.server.ts
async function resolveActiveTheme(resolution: TenantResolution): Promise<PublicTheme> {
  if (resolution.kind === 'partner') {
    const theme = await partnerRepository.getPublishedTheme(resolution.slug); // 002, in-process
    if (theme) return theme;            // PublicTheme del partner
  }
  return getDefaultPublicTheme();       // 002 — fallback indistinguible (FR-016)
}
```

- **Origen en esta feature**: `PartnerRepository` **in-process** (feature `002`,
  `src/server/`), sin HTTP (D3). El BFF `GET /api/theme/:slug` es **PRD 04**.
- **Fallback** (`kind !== 'partner'`, o partner sin theme publicado):
  `getDefaultPublicTheme()` — mismo shape, indistinguible entre motivos (FR-016,
  SC-006).
- El `PublicTheme` resuelto se usa para (a) pintar el HTML SSR con la marca
  inline (CSS vars + favicon + title + font preload) y (b) escribir
  `TransferState`.

## 2. `TransferState`

```typescript
import { makeStateKey, TransferState } from '@angular/core';

export const THEME_STATE_KEY = makeStateKey<PublicTheme>('theme');
```

| Momento | Acción |
|---|---|
| SSR, tras resolver | `transferState.set(THEME_STATE_KEY, publicTheme)` |
| Cliente, bootstrap | `const t = transferState.get(THEME_STATE_KEY, null)` → `ThemeStore.apply(t)` **y** `initialData` de la query |

**Garantía dura**: el valor transferido es **idéntico** (misma instancia lógica)
al usado para pintar el SSR ⇒ el primer paint y la experiencia interactiva
derivan de la misma data (FR-014, SC-002). El cliente **no** re-resuelve ni
re-pide el theme durante la hidratación (FR-007).

## 3. Caché de servidor (TanStack Query)

```typescript
// features/theming/queries/theme-queries.ts (conceptual)
bySlug(slug: string, version: number, initial: PublicTheme) {
  return queryOptions({
    queryKey: ['theme', slug, version],   // versión ⇒ cache-busting (FR-013)
    queryFn: () => this.api.getTheme(slug), // endpoint real: PRD 04
    initialData: initial,                  // desde TransferState ⇒ sin fetch inicial
    staleTime: 5 * 60_000,                 // PRD §6
    gcTime: 30 * 60_000,
  });
}
```

- **Navegación entre pasos** del mismo partner (misma `slug`+`version`): cache
  hit, **cero** requests de branding tras la primera resolución (FR-010, SC-003).
- **Publicación de un cambio** (PRD 05): `version` incrementa ⇒ nueva `queryKey`
  ⇒ la próxima visita resuelve el nuevo theme sin redeploy (FR-012, FR-013,
  SC-005). La invalidación explícita (`invalidateQueries(['theme', slug])`) y el
  `Cache-Control`/CDN server-side son **PRD 04/05**.

## 4. Frontera con PRD 04 (documentada, no ambigua)

| Aspecto | Esta feature (03) | PRD 04 (BFF) |
|---|---|---|
| Theme en primer paint | ✅ SSR in-process + TransferState | — |
| No re-fetch en navegación | ✅ `initialData` + `staleTime` (misma key) | — |
| `queryFn` (`ThemeApiService.getTheme`) | Definido; endpoint **stub/diferido** | Implementa `GET /api/theme/:slug` + caché edge |
| Invalidación al publicar | Contrato (key por versión) | Invalidación real + `Cache-Control` |

El `ThemeApiService` se crea con la firma final (`getTheme(slug): PublicTheme`)
pero su transporte HTTP real aterriza en PRD 04. Ningún componente inyecta
`HttpClient` directamente (Constitución I): acceden vía `injectQuery` sobre
`ThemeQueries`.

## 5. Propiedades de test (contract)

1. `resolveActiveTheme` con `kind:'partner'` y slug con theme publicado ⇒
   `PublicTheme` de ese partner.
2. `resolveActiveTheme` con `kind:'fallback' | 'root' | 'reserved'` ⇒
   `getDefaultPublicTheme()` (mismo objeto para todos los motivos, SC-006).
3. `resolveActiveTheme` con `kind:'partner'` pero sin theme publicado ⇒ default.
4. El valor leído de `TransferState` en cliente equivale al escrito en SSR
   (round-trip serializable).
5. Con `initialData` presente, la query no está en estado `fetching` en el primer
   render (no dispara `queryFn`).
