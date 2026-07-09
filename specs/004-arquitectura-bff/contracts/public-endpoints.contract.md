# Contract — Public endpoints (`/api/theme/:slug`, `/api/partners/active`)

Endpoints públicos, sin auth, cacheables. **Nunca** devuelven secretos, endpoints
internos ni IDs de integración (FR-010). Cubre FR-007, FR-008, FR-009, FR-019, FR-020.

---

## `GET /api/theme/:slug`

Sirve la **proyección pública** del theme publicado vigente del partner (contrato de
`002`), cacheada (FR-007/008, SC-004).

- **Entrada**: `:slug` — validado con `slug-validation` de `002` (FR-019). Slug
  malformado → `400 invalid_input`.
- **Resolución**: vía `PartnerRepository.getPublishedTheme(slug)` + `findBySlug` →
  `toPublicTheme(theme, partner)` (FR-018). Partner inexistente/inactivo/sin versión
  publicada → **theme default indistinguible** (`getDefaultPublicTheme()`), sin
  revelar la (in)existencia del partner (coherente con `003`/`001`).
- **Salida `200`**: `PublicTheme` exacto de `002`
  (`slug, displayName, version, tokens, assets, legal, typography`). **Cero** campos
  sensibles (SC-004).
- **Caché (FR-008, D8)**: `Cache-Control: public, max-age=<corto>, stale-while-revalidate=<...>`
  + `ETag` derivado de `version`. Un `If-None-Match` que coincide → `304`.
- **Rate limit (FR-020)**: sujeto al limiter público.

**Acceptance**:
1. `GET /api/theme/<activo>` → `200` con el shape público, sin `apiKey`/`baseUrl`/IDs.
2. La respuesta incluye `Cache-Control` y `ETag`; una segunda petición con
   `If-None-Match` igual → `304` (reutilizable en server/CDN sin reconsultar origen).
3. `GET /api/theme/<inexistente>` → `200` con el **default** (no `404`, no filtra
   existencia).
4. `GET /api/theme/<slug inválido>` → `400 invalid_input`.

---

## `GET /api/partners/active`

Lista de **slugs activos** para el resolver de tenant (`001`), sin datos sensibles
(FR-009).

- **Entrada**: ninguna.
- **Resolución**: `PartnerRepository.findActiveSlugs()` (FR-018).
- **Salida `200`**: `{ "slugs": string[] }` — solo slugs de partners **activos**
  (excluye `__default__`). Forma canónica aceptada por `PartnersApiService` de `003`.
- **Caché**: `Cache-Control` corto (la lista cambia sin redeploy — coherente con
  `RenderMode.Server` de `003`).
- **Rate limit (FR-020)**: sujeto al limiter público (mitiga enumeración de slugs).

**Acceptance**:
1. `GET /api/partners/active` → `200 { slugs: [...] }` con solo activos, sin
   metadatos sensibles.
2. Un partner dado de baja (inactive) **no** aparece en la lista.
3. Ráfaga por encima del umbral → `429 rate_limited` (FR-020).

---

## Reglas transversales

- **Sin secretos en salida (FR-010)**: revisado por un test que serializa la
  respuesta y verifica ausencia de `apiKey`/`baseUrl`/IDs de integración.
- **Solo puerto de repositorio (FR-018)**: los handlers no importan `node:sqlite` ni
  el adaptador SQLite directo; solo `createPartnerRepository()` / la interfaz.
- **Validación de entrada (FR-019)**: todo `:slug` pasa por `slug-validation`.
</content>
