# Contract — UI del panel: rutas, guard de rol, navegación y estados

Cableado del feature `admin` en el router, protección de acceso y estados de
pantalla. Cubre FR-003 y los Edge Cases de navegación/errores/estado vacío.

---

## Rutas (`admin.routes.ts`, lazy) — ARCHITECTURE §4

```text
admin/                         # loadChildren desde app.routes.ts (reemplaza el placeholder)
  '' (admin-layout)            # loadComponent; shell nav lateral + <router-outlet>
    ''            → partners-list      (US1)
    'nuevo'       → partner-create     (US2)
    ':id/editar'  → partner-edit       (US3/US4)
```

- La rama `admin` en `app.routes.ts` pasa de apuntar a `admin-placeholder` a
  `loadChildren: () => import('./features/admin/admin.routes')...`.
- El `admin-layout` es el único shell visual (chrome neutro, D3); cada página
  usa `loadComponent` (chunk propio).

## Protección de acceso (FR-003, D6)

```text
canActivate: [authGuard, roleGuard('admin')]
```

- Aplicado en el nivel padre del feature (envuelve todas las páginas).
- Sin rol `admin` → redirección/`UrlTree` a `/forbidden` **antes** de resolver
  cualquier página o consultar datos (US1.3).
- Defensa en profundidad: el BFF `/api/admin/*` ya hace default-deny (`004`); el
  guard de ruta impide además **mostrar** el shell/datos. El mecanismo de
  identidad y la fuente del rol son **PRD 06**; aquí se consume el seam
  (`AuthStore`/`roleGuard`).

---

## Estados de pantalla (cubren Edge Cases del spec)

### `partners-list`
- **Cargando**: skeleton/placeholder (query `pending`).
- **Con datos**: tabla con `displayName`, `slug`, badge `status`,
  `currentVersion`, `updatedAt`, `updatedBy` + acciones (Editar / Preview /
  Activar-Desactivar) + botón "Nuevo partner".
- **Buscando sin resultados**: estado vacío explícito ("no hay coincidencias"),
  **no** apariencia de error (Edge Case "búsqueda sin resultados", D7).
- **Error de carga**: mensaje de error del `ApiError` normalizado + reintento.

### `partner-create`
- Form reactivo (`slug`, `displayName`); validación de formato/reservados en
  cliente (feedback), unicidad resuelta por el BFF.
- **Éxito** → navega a `:id/editar` del partner recién creado.
- **Rechazo** (reservado/duplicado/inválido) → muestra el motivo, no crea nada.

### `partner-edit`
- Dos zonas: `brand-editor` (izq.) y `theme-preview` aislado (der.).
- Botones **Guardar** (crea borrador) y **Publicar** (mueve vigente); "Publicar"
  **deshabilitado** si no hay borrador pendiente ("nada nuevo que publicar",
  US4.3).
- **Guardado/publicado OK** → toast + estado actualizado (invalidación de query).
- **Pérdida de conexión al guardar/publicar** → error comprensible; el UI no
  queda ambiguo (se reconsulta el servidor como verdad, Edge Case D8).
- **Salir con cambios sin guardar** → aviso de descarte (protección del borrador).

---

## Navegación y layout

- `admin-layout` expone nav lateral (Partners, y secciones futuras) + área de
  contenido con `<router-outlet>`. Chrome neutro (utilidades Tailwind + átomos
  `ui/`), **independiente** de la marca de cualquier partner (esa solo vive en el
  preview).
- El estado activo de la marca de un partner **nunca** se aplica al layout
  (refuerzo de SC-009; ver `preview-isolation.contract.md`).

---

## Acceptance

1. Usuario sin rol `admin` navegando a `/admin` → redirigido a `/forbidden`, sin
   render del shell ni petición a `/api/admin/*` (FR-003, US1.3).
2. `/admin` (con rol) → `partners-list`; `/admin/nuevo` → `partner-create`;
   `/admin/:id/editar` → `partner-edit`; cada uno como chunk lazy propio.
3. Buscar un término inexistente muestra estado vacío, no error (Edge Case).
4. En `partner-edit` sin borrador pendiente, "Publicar" está deshabilitado
   (US4.3); con borrador, habilitado.
5. Un fallo de red al publicar muestra error claro y deja el estado consistente
   tras refetch (Edge Case D8).
6. Todos los componentes son standalone + `OnPush`, sin `ngClass`/`ngStyle`, con
   átomos `ui/` para controles (Const. II; ARCHITECTURE §5).
