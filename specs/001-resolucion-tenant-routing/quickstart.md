# Quickstart — Validación: Resolución de Tenant y Routing

Guía de validación **end-to-end** de la feature. Prueba que la resolución clasifica
correctamente cada tipo de URL, que el routing aplica precedencia de reservadas y
fall-through a la landing, y que la navegación intra-partner reutiliza la lista sin
refetch. No contiene implementación — los detalles de firma están en
[`contracts/`](./contracts/) y [`data-model.md`](./data-model.md).

## Prerrequisitos

- Node + dependencias instaladas (`npm install`, ya presentes en el repo).
- Dev server de Angular disponible (`npm start` → `ng serve`).
- Fuente de partners activos: BFF de PRD 04 **o** un mock local que responda
  `GET {apiUrl}/partners/active` con `{ "slugs": ["popular", "otrobanco"] }`
  (ver [`contracts/partners-source.contract.md`](./contracts/partners-source.contract.md)).

## A. Validación unitaria del resolver (la más importante — SC-006)

La lógica pura se valida sin navegador. Cubre TODOS los casos de la tabla de
comportamiento del contrato.

```bash
npm test -- --include='**/core/tenant/**/*.spec.ts'
```

**Se espera**: verdes en `resolve-tenant.spec.ts`, `slug.spec.ts`,
`reserved-names.spec.ts` cubriendo, como mínimo, los 16 casos de
[`contracts/resolve-tenant.contract.md §1`](./contracts/resolve-tenant.contract.md):
slug válido, root, reservada (`admin`/`api`/`Admin`/`favicon.ico`), desconocido,
inactivo (indistinguible), mayúsculas, espacios, charset inválido, longitud fuera de
rango. Mapea 1:1 con **SC-006**.

## B. Validación de flujo en el navegador

```bash
npm start   # ng serve
```

Con la fuente sirviendo `popular` y `otrobanco` activos, verificar:

| Escenario | URL | Resultado esperado | Requisito / SC |
|-----------|-----|--------------------|----------------|
| Partner activo | `/popular/oferta` | Se activa el shell de partner; `TenantStore` expone `partnerSlug='popular'` | US1 / SC-001 |
| Navegación intra-partner | `/popular/oferta` → `/popular/beneficiarios` | Sigue resuelto `popular`; **no** hay nuevo `GET /partners/active` (caché TTL) | US1 / SC-004 |
| Raíz | `/` | Landing neutra con theme default; **no** lista partners | Edge / SC-002 |
| Slug desconocido | `/no-existe/x` | Landing neutra, mensaje "Este enlace no corresponde a un socio activo", sin errores en consola | US2 / SC-002 |
| Partner inactivo | `/inactivo` | Idéntico a slug desconocido (respuesta uniforme) | US2 / SC-003 |
| Formato inválido | `/Popular!` | Fallback a landing neutra | US2 / SC-002 |
| Ruta reservada | `/admin` | Entra al Back Office (placeholder), **nunca** shell de partner | US3 / SC-001 |
| Reservada API | `/api/...` | Tratada como reservada, no como partner | US3 |

**Cómo observar la reutilización sin refetch (SC-004)**: con las DevTools abiertas
(pestaña Network, filtro `partners/active`), navegar entre dos pasos del mismo
partner y confirmar que **no** se dispara una segunda petición dentro de la ventana
de TTL. La verificación visual/flujo puede apoyarse en Playwright CLI (ver
`.claude/TOOLS.md`), que es herramienta de validación del agente, no framework de
pruebas.

## C. Validación de fail-safe (FR-014 / SC-003)

1. Detener el BFF/mock (o hacer que `GET /partners/active` responda 500).
2. Abrir `/popular/oferta`.

**Se espera**: la app muestra la **landing neutra** (fallback), **sin** distinguirse
de un slug desconocido, **sin** mensaje de "servicio no disponible" y **sin** errores
propagados a la UI. La resolución falla de forma segura.

## D. Criterios de aceptación cubiertos

- [ ] `A` verde ⇒ SC-006 y toda la tabla de comportamiento del resolver.
- [ ] `B` fila "Partner activo" ⇒ US1 / SC-001 / SC-005 (identidad desde el primer
      render; el theming concreto es PRD 03).
- [ ] `B` fila "Navegación intra-partner" ⇒ SC-004 (sin refetch).
- [ ] `B` filas de fallback + `C` ⇒ SC-002 / SC-003 (uniforme e indistinguible).
- [ ] `B` filas reservadas ⇒ US3 (precedencia de reservadas).

> **Fuera de alcance de esta validación**: anti-FOUC/SSR y el contenido del theme
> (PRD 03/06), y la validación de alta de slug reservado en el Back Office (FR-012,
> PRD 05) — aquí solo se garantiza que `RESERVED_NAMES` es la fuente única que ese
> alta podrá reutilizar.
