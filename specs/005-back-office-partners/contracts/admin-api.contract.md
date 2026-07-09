# Contract — `AdminApiService` ↔ `/api/admin/*` + `AdminQueries`

Frontera HTTP del panel: el `AdminApiService` (envuelve `HttpClient`,
`providedIn: 'root'`) y las `queryOptions`/mutations de `admin-queries.ts`. Los
componentes **nunca** inyectan `HttpClient`/`AdminApiService` directamente — solo
`injectQuery`/`injectMutation` (Const. I; ARCHITECTURE §2/§3). Cubre FR-001,
FR-002, FR-004, FR-005, FR-006, FR-013, FR-014, FR-015, FR-016, FR-009.

Los endpoints ya existen en `src/server/api/admin-router.ts` (`004`); este
contrato es el **lado cliente** que los consume, sin cambiar su forma.

---

## `AdminApiService` (métodos)

| Método | HTTP | Endpoint | Respuesta |
|--------|------|----------|-----------|
| `listPartners(filter?)` | GET | `/api/admin/partners?status=` | `PartnerListItem[]` |
| `getPartner(id)` | GET | `/api/admin/partners/:id` | `PartnerDetail` |
| `createPartner(req)` | POST | `/api/admin/partners` | `{ partner: Partner; theme: PartnerTheme }` |
| `saveThemeVersion(id, req)` | PATCH | `/api/admin/partners/:id` | `PartnerTheme` |
| `publish(id, themeId)` | POST | `/api/admin/partners/:id/publish` | `{ ok: true }` |
| `deactivate(id)` | POST | `/api/admin/partners/:id/deactivate` | `{ ok: true }` |
| `activate(id)` | POST | `/api/admin/partners/:id/activate` | `{ ok: true }` |
| `uploadAsset(req)` | POST | `/api/admin/assets` | `StoredAssetRef` |

> `activate` / `getPartner`: si `004` aún no expone estas rutas exactas, son
> adiciones simétricas a las existentes (mismo puerto `PartnerRepository`), no un
> rediseño. El panel las asume; su implementación es del BFF.

Reglas del servicio:
- Solo envuelve `HttpClient` y mapea DTO↔modelo. **Sin lógica de negocio ni
  estado** (ARCHITECTURE §3). Lee `environment.apiUrl` como base, nunca URLs
  hardcodeadas.
- No adjunta tokens manualmente: el `auth-interceptor` (`004`/ARCHITECTURE §3) lo
  hace. Los errores se normalizan en el `error-interceptor`.

---

## `AdminQueries` (`queryOptions` + invalidación)

```typescript
@Injectable({ providedIn: 'root' })
export class AdminQueries {
  private api = inject(AdminApiService);

  partners(filter?: PartnersListFilter) {
    return queryOptions({
      queryKey: ['admin', 'partners', filter?.status ?? 'all'],
      queryFn: () => this.api.listPartners(filter),
    });
  }

  partner(id: string) {
    return queryOptions({
      queryKey: ['admin', 'partners', id],
      queryFn: () => this.api.getPartner(id),
    });
  }
}
```

Mutaciones (en el componente, vía `injectMutation`), cada una **invalida** las
queries afectadas en `onSuccess`:

| Mutación | Invalida |
|----------|----------|
| `createPartner` | `['admin','partners']` |
| `saveThemeVersion` | `['admin','partners', id]` |
| `publish` | `['admin','partners', id]` + `['admin','partners']` (versión vigente cambió) |
| `deactivate` / `activate` | `['admin','partners', id]` + `['admin','partners']` |
| `uploadAsset` | — (no toca server-state de partners; devuelve URL al borrador local) |

---

## No-exposición de secretos (FR-016, SC-008)

- `PartnerListItem`/`PartnerDetail` **nunca** contienen `apiKey`/`baseUrl` ni
  credenciales del bucket; solo `credentialConfigured: boolean`.
- El upload devuelve `{ url, key }` públicos; el binario y las credenciales del
  storage quedan del lado servidor (`004`).

---

## Acceptance

1. `partners-list` obtiene datos vía `injectQuery(adminQueries.partners(...))`;
   **no** inyecta `HttpClient` ni `AdminApiService` (test: no aparece en el
   constructor/inject del componente). (Const. I)
2. `createPartner` con slug válido → `201` con partner **inactivo** + theme **v1
   borrador**; en `onSuccess` invalida `['admin','partners']` y navega al editor.
   (FR-006)
3. `createPartner` con slug reservado/duplicado → error del BFF mapeado a
   `ApiError`; el form muestra el motivo sin crear nada. (FR-005, US2.3/2.4)
4. `saveThemeVersion` → `200` con `PartnerTheme` nueva (versión incrementada),
   sin mover la vigente; invalida el detalle. (FR-013)
5. `publish` → `200`; invalida detalle y listado; el listado refleja la nueva
   `currentVersion`. (FR-014)
6. `AdminApiService` probado con `HttpTestingController`: verifica método, URL y
   body de cada llamada; ninguna respuesta admin deserializa `apiKey`/`baseUrl`.
   (FR-016, ARCHITECTURE §9)
7. `uploadAsset` devuelve `{ url, key }`; la `url` se asigna al asset del borrador
   sin exponer credenciales del bucket. (FR-009, SC-008)
