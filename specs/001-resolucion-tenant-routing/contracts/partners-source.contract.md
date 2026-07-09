# Contract — Fuente de partners activos (BFF → TanStack Query)

Contrato de consumo de la **lista de partners activos**. Esta feature **consume** la
fuente de verdad del BFF (PRD 04); no la administra. Define el endpoint esperado, el
DTO, el mapeo a `ActivePartnerSlugs` y la configuración de caché/TTL. El BFF real es
PRD 04; hasta entonces puede servirse mockeado sin cambiar el contrato del cliente.

---

## 1. Endpoint (BFF, PRD 04)

```
GET {apiUrl}/partners/active
```

- **Auth**: pública o según política del BFF (no la decide esta feature).
- **Respuesta 200** — lista de partners activos. Dos formas admitidas; el cliente
  mapea ambas a un `ReadonlySet<PartnerSlug>`:

  **Forma A (recomendada, minimiza superficie de enumeración)** — solo slugs activos:
  ```json
  { "slugs": ["popular", "otrobanco"] }
  ```

  **Forma B** — partners con estado (el cliente filtra `status === 'active'`):
  ```json
  { "partners": [
    { "slug": "popular",   "status": "active" },
    { "slug": "otrobanco", "status": "active" }
  ] }
  ```

- **Errores (4xx/5xx) o red caída**: el consumidor NO los muestra; la resolución cae
  a `fallback` de forma indistinguible (FR-014, D9). El contrato no define cuerpos de
  error porque el cliente no los interpreta más allá de "no hay lista fresca".

> **Nota anti-enumeración**: la Forma A es preferible porque no expone partners
> inactivos ni permite inferir su existencia (SC-003). El endpoint **no** debe
> ofrecer un listado paginado/buscable orientado a descubrir partners.

---

## 2. Capa de acceso (cliente) — Constitución I / `ARCHITECTURE.md §3`

```
PartnersApiService (features/partners/services/partners-api.ts)
  · inject(HttpClient), providedIn: 'root'
  · getActivePartners(): Observable<ReadonlySet<PartnerSlug>>
  · lee environment.apiUrl (§8); mapea DTO (Forma A/B) → Set de slugs activos
        │
        ▼
PartnersQueries (features/partners/queries/partners-queries.ts)
  · @Injectable providedIn: 'root'; inject(PartnersApiService)
  · activePartners() => queryOptions({
        queryKey: ['partners', 'active'],
        queryFn: () => firstValueFrom(this.partnersApi.getActivePartners()),
        staleTime: <TTL>,     // default 60_000 ms, configurable (D8, FR-015)
      })
        │
        ▼
tenantMatch (core/tenant/tenant-guard.ts)
  · inject(QueryClient).ensureQueryData(partnersQueries.activePartners())
  · NUNCA inject(HttpClient) ni PartnersApiService directo
```

**Reglas**
- Los componentes y el guard **no** inyectan `HttpClient` ni `PartnersApiService`
  directamente; el acceso a este estado de servidor es **solo** vía TanStack Query
  (Constitución I).
- `staleTime` = TTL de FR-015: dentro de la ventana la lista se sirve de caché (sin
  refetch → FR-008, SC-004); pasada la ventana, el siguiente acceso refetchea, con lo
  que una desactivación surte efecto dentro del TTL.
- El TTL se lee de `environment` (`ARCHITECTURE.md §8`), no hardcodeado en la query.

---

## 3. Mapeo DTO → dominio

| DTO (Forma A/B) | Dominio | Regla |
|-----------------|---------|-------|
| `slugs: string[]` | `ReadonlySet<PartnerSlug>` | `new Set(slugs)` |
| `partners: {slug,status}[]` | `ReadonlySet<PartnerSlug>` | `new Set(partners.filter(p => p.status==='active').map(p => p.slug))` |

El `Set` resultante es exactamente el `activeSlugs` que recibe `resolveTenant`
(ver `resolve-tenant.contract.md §1`). Se asume que los slugs ya vienen normalizados
del BFF; si no, se aplica `normalizeSlug` en el mapeo defensivamente.
