# Quickstart — Validación: Back Office — Gestión de Partners

Guía **ejecutable** para validar la feature end-to-end. Combina specs unitarios
(Karma/Jasmine) y un flujo manual con el servidor SSR/BFF ya existente. No
contiene código de implementación — remite a `data-model.md` y `contracts/`.

## Prerrequisitos

- Node 22.20, dependencias instaladas (`npm ci`).
- El BFF `/api/admin/*` de la feature `004` disponible (ya en el repo,
  `src/server/api/admin-router.ts`).
- Al menos un partner de fixture cargado (ver `src/server/persistence/__fixtures__/brands.ts`).
- Rol `admin` disponible en la sesión (seam de PRD 06; en V1, el estado del
  `AuthStore` que habilite el `roleGuard`).

## Comandos

```bash
# Unit specs del front (incluye admin)
npm test

# Levantar el servidor SSR + BFF (sirve el panel y /api/admin/*)
npm run serve:ssr    # o el script equivalente de 003/004

# Verificación visual manual del agente (opcional): Playwright CLI
#   navegar a /admin, /admin/nuevo, /admin/:id/editar
```

---

## Escenarios de validación (mapeados a User Stories)

### US1 — Ver y encontrar partners (P1)
1. Navegar a `/admin` con rol `admin` → se ve la lista con `displayName`, `slug`,
   badge de estado, versión vigente, `updatedAt`, `updatedBy`.
2. Escribir en el buscador → la lista se filtra por nombre/slug **sin recargar**;
   un término inexistente muestra **estado vacío** (no error).
3. Navegar a `/admin` **sin** rol `admin` → redirección a `/forbidden`, sin datos.
   → Contratos: `admin-api`, `admin-ui-contract`.

### US2 — Dar de alta un partner (P1)
1. `/admin/nuevo`, slug `popular` + nombre "Banco Popular" → partner **inactivo**
   + theme **v1 borrador**; redirige al editor.
2. Slug con mayúsculas/espacios → rechazado con motivo de formato.
3. Slug `admin`/`api` → rechazado por reservado. Slug duplicado → rechazado por
   unicidad (motivo del BFF). Nombre vacío → marcado requerido.
   → Contratos: `admin-api` (create), `admin-ui-contract`.

### US3 — Editar la marca con preview en vivo (P2)
1. En el editor, cambiar color primario → el **preview** se actualiza al instante
   (<1 s), **sin** guardar ni publicar.
2. Elegir un color de texto sin contraste AA → el editor **advierte**, sin
   bloquear.
3. Subir un logo inválido (tipo/tamaño/dimensión) → rechazado con motivo; uno
   válido se sube vía BFF.
4. Observar el chrome del panel alrededor del preview → **permanece intacto**
   (preview aislado, SC-009).
5. Guardar → nueva versión en **borrador**, sin afectar la vigente.
   → Contratos: `brand-editor-form`, `preview-isolation`, `admin-api`.

### US4 — Publicar una versión (P2)
1. Con un borrador pendiente, pulsar Publicar → la versión pasa a **vigente**; la
   experiencia pública del partner (`/{slug}/...`) refleja el cambio **sin
   redeploy** (invalidación de `003`).
2. Sin borrador pendiente → "Publicar" deshabilitado ("nada nuevo que publicar").
   → Contratos: `admin-api` (publish), `admin-ui-contract`.

### US5 — Activar / desactivar (P3)
1. Desactivar un partner activo → pasa a **inactivo**, deja de servirse en la
   experiencia pública (fallback), conserva historial; sigue en el listado.
2. Reactivar → vuelve a servirse. En ningún caso hay borrado físico.
   → Contratos: `admin-api` (deactivate/activate).

---

## Unit specs esperados (Karma/Jasmine, `*.spec.ts` junto al fuente)

| Spec | Verifica | Contrato / Req |
|------|----------|----------------|
| `contrast-ratio.spec.ts` | ratio WCAG y veredicto AA para pares conocidos | `brand-editor-form` / FR-008 |
| `scoped-theme.spec.ts` | escribe `--brand-*` en el host dado, **no** en `:root` | `preview-isolation` / SC-009 |
| `admin-api.spec.ts` | método/URL/body de cada llamada (`HttpTestingController`); sin `apiKey`/`baseUrl` en respuestas | `admin-api` / FR-016 |
| `partners-list.spec.ts` | filtro cliente + estado vacío | `admin-ui-contract` / FR-002 |
| `partner-create.spec.ts` | validación de slug (formato/reservado) + requerido | `admin-api` / FR-005 |
| `brand-editor.spec.ts` | form reactivo tipado; dirty; advertencia AA no bloquea | `brand-editor-form` / FR-007/008 |
| `theme-preview.spec.ts` | reaplica tokens en `effect` sobre el host; usa átomos reales | `preview-isolation` / FR-010/012 |
| `color-field.spec.ts` | picker+hex sincronizados; advertencia sin `ValidationError` | `brand-editor-form` / FR-008 |

---

## Criterios de éxito verificados (spec → SC)

- **SC-002**: cambio de color → preview <1 s (verificación manual + `theme-preview.spec`).
- **SC-003**: 100% de slugs inválidos/reservados/duplicados rechazados con motivo.
- **SC-004**: publicar refleja el cambio en la experiencia pública sin redeploy.
- **SC-008**: el bundle/red del panel nunca expone credenciales del bucket
  (`admin-api.spec` + revisión de red).
- **SC-009**: editar la marca nunca altera el chrome del panel (`scoped-theme.spec`
  + verificación visual).
