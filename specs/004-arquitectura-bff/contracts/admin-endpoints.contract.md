# Contract — Admin endpoints (`/api/admin/*`)

Endpoints de administración del Back Office (PRD 05), **protegidos** por el seam
`adminAuthGuard`. El **mecanismo de identidad/SSO es PRD 06**; aquí se exige la
protección (default-deny) y la no-exposición de secretos. Cubre FR-015, FR-016,
FR-017, FR-018.

---

## Protección (FR-015, D6)

Todo `/api/admin/*` pasa primero por `adminAuthGuard.authorize(req)`:
- Sin sesión válida → **`401 unauthorized`** (o `403`), **sin** ejecutar ninguna
  acción (SC-006).
- Con sesión válida → continúa; la sesión (`subject`, `roles`) queda disponible para
  auditoría (PRD 06).
- V1: **default-deny**; PRD 06 conecta el verificador real sin tocar los handlers.

---

## Endpoints (PRD 04 §4)

| Método | Ruta | Acción | Puerto de datos |
|--------|------|--------|-----------------|
| GET | `/api/admin/partners` | Listar partners (estado + buscador) | `PartnerRepository.listPartners` |
| POST | `/api/admin/partners` | Crear partner | `PartnerRepository.createPartner` |
| PATCH | `/api/admin/partners/:id` | Editar/crear versión de theme | `PartnerRepository.saveThemeVersion` |
| POST | `/api/admin/partners/:id/publish` | Publicar versión | `PartnerRepository.publishThemeVersion` |
| POST | `/api/admin/partners/:id/deactivate` | Baja lógica | `PartnerRepository.deactivatePartner` |
| POST | `/api/admin/assets` | Intermediar upload a object storage | `AssetStorage.put` |
| GET | `/api/admin/audit` | Historial de auditoría (PRD 06) | persistencia de audit (`002`) |

**Todos** acceden a datos **solo** vía el puerto (FR-018) — ningún SQL directo.

---

## No-exposición de secretos (FR-016)

Las respuestas admin **nunca** devuelven el secreto en claro. Para el estado de la
credencial de integración de un partner se expone **solo** el metadato:

```json
{ "slug": "banco-popular", "status": "active", "credentialConfigured": true }
```

`credentialConfigured` proviene de `SecretResolver.isConfigured(slug)` — nunca del
valor. Cualquier error de repositorio se mapea a `ApiError` uniforme.

---

## Upload de assets (FR-017)

`POST /api/admin/assets`:
1. Valida el binario server-side: `validateBrandAsset` (MIME/tamaño/dimensiones) +
   `svg-sanitize` para SVG (reusados de `002`).
2. Intermedia la subida vía `AssetStorage.put` (o `createSignedUploadUrl`), **sin**
   exponer credenciales del storage al cliente.
3. Devuelve `StoredAssetRef { url, key }` (públicas).

Binario inválido → `400 invalid_input` (sin subir nada).

---

## Acceptance

1. Cualquier `/api/admin/*` **sin** sesión válida → `401/403`, sin efecto (SC-006).
2. `GET /api/admin/partners` con sesión válida → lista con `credentialConfigured`
   (boolean), **sin** el secreto en claro (FR-016).
3. `POST /api/admin/partners` con sesión válida → crea vía `createPartner` (puerto),
   sin SQL directo (FR-018).
4. `POST /api/admin/assets` con binario válido → sube vía `AssetStorage` y devuelve
   `{ url, key }`, sin credenciales del storage; binario inválido → `400`.
5. Ninguna respuesta admin contiene `apiKey`/`baseUrl` (test de serialización).
</content>
