# PRD 05 — Back Office: Gestión de Partners

> **Depende de:** [02 Modelo/Theme](./02-modelo-de-partner-y-contrato-de-theme.md)
> (contratos), [03 Theming](./03-theming-dinamico-y-anti-fouc.md) (motor de
> preview), [04 BFF](./04-arquitectura-bff.md) (endpoints admin).
> **Habilita:** [06 AuthZ/Auditoría](./06-authz-roles-y-auditoria.md).

---

## 1. Objetivo

Especificar el **panel de administración interno** (feature `admin`) donde un
usuario interno da de alta partners, configura su marca, los activa/desactiva y
**previsualiza en vivo** la experiencia. **Este panel no existe en Figma
(decisión 6, PRD 00): se diseña desde cero aquí**, reutilizando el motor de
theming del PRD 03 y los átomos de `shared/components/ui`.

---

## 2. Alcance

### In-scope

- Listado de partners con estado (activo/inactivo) y **buscador**.
- **Alta** de partner (slug, displayName, theme inicial).
- **Edición** de branding (editor visual de marca).
- **Preview en vivo** de la experiencia con la config actual.
- **Desactivación** (baja lógica, nunca borrado físico).
- **Publicación** de una versión de theme (borrador → publicado).

### Out-of-scope

- Editar el journey o la lógica del seguro (decisión 5, PRD 00).
- Auto-registro externo de bancos (el alta la hace un admin interno).
- Gestión de usuarios/roles del IdP (eso lo owna el SSO, PRD 06).

---

## 3. Estructura del feature (según ARCHITECTURE.md)

Feature-first, lazy, con layout propio (`ARCHITECTURE.md` §1/§4):

```
src/app/features/admin/
  admin.routes.ts                 # lazy, guards authGuard → roleGuard('admin') (PRD 06)
  layouts/
    admin-layout.ts               # shell: nav lateral + <router-outlet>
  pages/
    partners-list/partners-list.ts     # listado + buscador
    partner-create/partner-create.ts   # alta
    partner-edit/partner-edit.ts       # editor de marca + preview
  components/
    brand-editor/brand-editor.ts       # form reactivo de tokens/assets/legal
    theme-preview/theme-preview.ts     # lienzo de preview en vivo
    color-field/color-field.ts         # input color con validación de contraste
    asset-uploader/asset-uploader.ts   # upload logo/favicon vía BFF
  models/
    partner-admin-model.ts             # DTOs de administración (referencian PRD 02)
  queries/
    admin-queries.ts                   # queryOptions/mutations → BFF (PRD 04)
  services/
    admin-api.ts                       # AdminApiService: envuelve HttpClient → /api/admin/*
```

Cumplimiento de reglas: standalone + `OnPush`, `input()`/`output()`,
`computed()`, **Reactive Forms**, `inject()`, sin `ngClass/ngStyle`, átomos
compartidos para controles (Constitución 5–13; `ARCHITECTURE.md` §5).

---

## 4. Pantalla: Listado de partners

- Tabla/lista con: `displayName`, `slug`, `status` (badge activo/inactivo),
  `version` de theme vigente, `updatedAt`, `updatedBy`.
- **Buscador** por nombre o slug (filtro cliente sobre la query cacheada +
  server-side si crece).
- Acciones por fila: **Editar**, **Preview**, **Activar/Desactivar**.
- Botón **"Nuevo partner"**.
- Datos vía TanStack Query (`admin-queries.ts` → `/api/admin/partners`), nunca
  `HttpClient` directo en el componente (Constitución regla 4).

```
┌───────────────────────────────────────────────────────────────┐
│  Partners                                   [ + Nuevo partner ] │
│  [ Buscar: ____________ ]                                       │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Banco Popular   /popular   ● Activo   v7   2026-06-30  ⋯   │ │
│ │ Otro Banco      /otrobanco ○ Inactivo v2  2026-05-12  ⋯   │ │
│ └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 5. Pantalla: Alta de partner

Formulario reactivo:
- `slug` — validado contra reglas del PRD 01 §3 (kebab, longitud) **y** la
  lista de **slugs reservados**; unicidad verificada contra el BFF.
- `displayName` — requerido.
- Theme inicial — parte del **theme default** como plantilla; el admin ajusta
  colores/logo en el editor (§6) antes de publicar.
- Al crear: `POST /api/admin/partners` → `Partner` + `PartnerTheme` v1 en
  **borrador** (PRD 02 §4). El partner nace **inactivo** hasta publicar.

---

## 6. Editor visual de marca (`brand-editor`)

Formulario reactivo que edita el `PartnerTheme` (PRD 02 §3):

| Grupo | Campos | Control |
|-------|--------|---------|
| Colores | primary, primaryTint, secondary, secondaryTint, surface, border, textStrong, textMuted | `color-field` (picker + hex) con **validación de contraste WCAG** |
| Assets | logo (header), favicon, logo banco (co-brand), logo grupo | `asset-uploader` → `/api/admin/assets` (PRD 04 §4) |
| Tipografía | fontFamily, (opcional) fuente custom woff2 | select + upload |
| Legal | footerDisclaimer, termsUrl, privacyUrl | textarea/inputs |

- **Validación de contraste**: al elegir un color, se calcula el ratio contra
  su superficie; si no cumple AA, se advierte (mitiga riesgo del PRD 03 §9).
- **Validación de assets** (client + server, PRD 02 §5): MIME, tamaño,
  dimensiones, sanitización de SVG.
- Guardar crea una **nueva versión** en borrador (PRD 02 §4). **Publicar**
  invoca `/api/admin/partners/:id/publish` e invalida caché (PRD 03 §6).

---

## 7. Preview en vivo (`theme-preview`) — pieza clave

Reutiliza el **motor de theming del PRD 03**: aplica los tokens en edición a un
**scope aislado** (no al `:root` global del Back Office) y renderiza una
**pantalla real del journey** como lienzo.

- **Cómo:** el `theme-preview` monta un contenedor con las CSS custom
  properties del borrador (no toca el `ThemeStore` global) y dentro renderiza
  un componente de muestra representativo — p. ej. la pantalla **"Ofrecimiento
  del seguro"** ("Personaliza tu seguro"), que en el Figma concentra header con
  logo, botones primarios, cards tint y **footer co-branded** con disclaimer.
- **En vivo:** cada cambio del `brand-editor` (signals + `computed`) actualiza
  el preview inmediatamente, sin guardar ni publicar.
- **Fidelidad:** el mismo átomo de header/footer/botones que usa la experiencia
  real (`shared/components/ui`) se usa en el preview → lo que se ve es lo que
  el cliente verá.

```
┌──────────────── Editor ────────────────┐  ┌──────── Preview en vivo ────────┐
│ Color primario   [#00947F]  ▢          │  │  [LOGO Seguros Alfa]            │
│ Color secundario [#105163]  ▢          │  │  Personaliza tu seguro          │
│ Logo header      [subir…]              │  │  [ Mi Vida ][ Financiera ][Salud]│
│ Logo banco       [subir…]              │  │  ...coberturas...  [Continuar]  │
│ Disclaimer       [textarea]            │  │  ── banco popular · Grupo Aval ──│
│                    [Guardar][Publicar] │  │  Vigilado por la Superfinanciera │
└────────────────────────────────────────┘  └──────────────────────────────────┘
```

---

## 8. Requisitos funcionales

- **RF-05.1** Listar partners con estado y buscador.
- **RF-05.2** Crear partner con slug validado (reglas PRD 01 + reservados +
  unicidad).
- **RF-05.3** Editor visual de colores/logos/tipografía/legales sobre el
  contrato `PartnerTheme`.
- **RF-05.4** Preview en vivo con el motor de theming del PRD 03, en scope
  aislado, sobre una pantalla real del journey.
- **RF-05.5** Guardar crea versión en borrador; publicar la hace vigente e
  invalida caché.
- **RF-05.6** Desactivar = baja lógica (`status = inactive`), nunca borrado.
- **RF-05.7** Toda mutación registra actor + timestamp (auditoría, PRD 06).
- **RF-05.8** Componentes cumplen la Constitución (standalone, OnPush, Reactive
  Forms, sin HttpClient directo, átomos compartidos).

---

## 9. Criterios de aceptación

- [ ] Crear "Banco Popular" con slug `popular` genera partner inactivo + theme
      v1 borrador.
- [ ] Intentar slug `admin` o `api` es rechazado (reservado).
- [ ] Cambiar el color primario actualiza el preview al instante, sin publicar.
- [ ] Publicar refleja el cambio en `app.com/popular/...` sin redeploy
      (invalidación PRD 03 §6).
- [ ] Desactivar un partner lo saca de la experiencia (fallback, PRD 01) pero
      conserva su historial.
- [ ] Subir un logo lo aloja en object storage vía BFF; el bundle no expone
      credenciales del bucket.
- [ ] El editor advierte cuando un color no cumple contraste AA.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Preview global "ensucia" el theme del Back Office | Scope aislado de CSS vars, no toca `:root` ni `ThemeStore`. |
| Admin publica un theme ilegible | Validación de contraste + preview obligatorio antes de publicar. |
| Slug duplicado por carrera de dos admins | Unicidad garantizada por la DB (PRD 02) + verificación en el BFF. |
| Divergencia entre preview y experiencia real | Reutilizar los mismos átomos `ui/` en ambos. |
