# PRDs — Plataforma Modular Multi-Tenant (Seguros / Multi-Banco)

Suite de **Product Requirements Documents** para la plataforma web
multi-tenant que sirve la **experiencia modular de venta de seguro de vida**,
re-brandeable por **banco distribuidor (partner)**, con un **Back Office** de
administración y un **BFF** que aísla los secretos del navegador.

> Estos PRDs son **secuenciales y coherentes**: cada uno se apoya en las
> decisiones del anterior. Léelos en orden. Cada documento abre con una
> sección **"Depende de / Habilita"** que explicita el encadenamiento.

---

## Orden de lectura

| # | PRD | Qué define |
|---|-----|------------|
| 00 | [Visión y alcance](./00-vision-y-alcance.md) | Problema, dominio, personas, glosario, alcance, hitos |
| 01 | [Resolución de tenant y routing](./01-resolucion-de-tenant-y-routing.md) | Cómo la URL resuelve el partner (path prefix) |
| 02 | [Modelo de partner y contrato de theme](./02-modelo-de-partner-y-contrato-de-theme.md) | Entidades `Partner` / `PartnerTheme`, persistencia |
| 03 | [Theming dinámico y anti-FOUC](./03-theming-dinamico-y-anti-fouc.md) | Aplicación del theme en el front, SSR, caché |
| 04 | [Arquitectura BFF](./04-arquitectura-bff.md) | Capa server, secretos, orquestación a externos |
| 05 | [Back Office — gestión de partners](./05-back-office-gestion-de-partners.md) | CRUD, editor de marca, preview en vivo |
| 06 | [AuthZ, roles y auditoría](./06-authz-roles-y-auditoria.md) | SSO OIDC/SAML, permisos, trazabilidad de cambios |
| 07 | [Requisitos no funcionales y observabilidad](./07-requisitos-no-funcionales-y-observabilidad.md) | Seguridad, escalabilidad, performance, testing |
| 08 | [Roadmap y plan de entrega](./08-roadmap-y-plan-de-entrega.md) | Fases, MVP, grafo de dependencias, backlog |

Los PRDs **00–08** cubren la **plataforma** (tenant, theme, BFF, back office,
authz, NFR, roadmap). Las **páginas del journey de venta** se especifican aparte,
en la serie `09+` (abajo).

---

## Serie de páginas del journey (09+)

Cada **página** del journey de venta tiene su **propio PRD** — una página = un
PRD, con sus **validaciones individuales** (no se agrupan varias páginas en un
mismo documento). Se especifican a partir del Figma existente; el flujo es
idéntico para todos los partners y solo se re-brandea (decisión 5).

| PRD | Página del journey | Estado |
|-----|--------------------|--------|
| 09 | [Conoce a tu cliente (KYC)](./09-page-conoce-a-tu-cliente.md) | **Especificado** |
| 10 | Datos del cliente | Reservado |
| 11 | Declaración de salud | Reservado |
| 12 | Ofrecimiento del seguro | Reservado |
| 13 | Agendamiento cita médica | Reservado |
| 14 | Selección de beneficiarios | Reservado |
| 15 | Resumen / Confirmación | Reservado |
| 16 | OTP y TyC | Reservado |
| 17 | Medio de pago + Activación | Reservado |
| 18 | Activar beneficios digitales | Reservado |
| 19 | Comunicaciones postventa | Reservado |
| 20 | Web login / Doble login / Home | Reservado (definir granularidad) |
| 21 | Desistir de la venta | Reservado |

> La **numeración** refleja el **orden de autoría** (se especifica primero KYC,
> por eso es `09`); el **orden real del flujo** se conserva en "Journey
> observado" más abajo. Cada nuevo PRD de página usa el prefijo `NN-page-*.md` y
> sigue la misma plantilla de la suite.

### Orden de construcción

- La serie `09+` se construye sobre la **infraestructura de la Fase 1** (routing
  01, theming 03, BFF/proxy de journey 04). Su **dependencia dura** es esa infra:
  la primera página (**KYC**) **no** espera a que "termine" el PRD 08 (que es el
  documento de planeación), ni al Back Office.
- Se construye de forma **secuencial por flujo**: `09 KYC → 10 Datos del cliente
  → 11 Declaración de salud → …`.
- Por priorización acordada (**Back Office primero**), la serie se **agenda tras**
  las fases de Back Office y AuthZ. Ver **[PRD 08](./08-roadmap-y-plan-de-entrega.md)
  → Fase 5 — Páginas del journey**.

---

## Mapa de dependencias

```
00 Visión ──┐
            ├─► 01 Tenant/Routing ──┐
            │                       ├─► 03 Theming ──┐
            └─► 02 Modelo/Theme ────┤                ├─► 05 Back Office ──► 06 AuthZ/Auditoría
                                     └─► 04 BFF ──────┘
                                                         07 No-funcionales (transversal a todos)
                                                         08 Roadmap (secuencia todo)

  01 Tenant/Routing ─┐
  03 Theming ────────┼─► 09+ Páginas del journey (09 KYC → 10 Datos → 11 Salud → …)
  04 BFF ────────────┘   (cuelgan de la infra de Fase 1; ver PRD 08 → Fase 5)
```

---

## Decisiones transversales (north star)

Estas 6 decisiones están fijadas y **no se reinterpretan** por PRD. Cualquier
cambio a una de ellas obliga a actualizar el PRD 00 y propagar.

1. **Resolución de tenant = path prefix** (`app.com/{partnerSlug}/...`).
   Subdominio queda documentado como alternativa futura. → PRD 01.
2. **BFF = Angular SSR (Node) en el mismo repo** (`server.ts` + route
   handlers). Un repo, un deploy; theme inyectado en SSR para evitar FOUC.
   → PRD 04.
3. **Auth del Back Office = SSO corporativo (OIDC/SAML)**; el BFF valida
   tokens, roles vía claim del IdP. → PRD 06.
4. **Persistencia dentro del alcance, tras un puerto de repositorio**: config de
   partners accedida vía `PartnerRepository`. **V1 = SQLite con respaldo continuo
   en bucket (Litestream single-node)** y assets en object storage/CDN; el
   **escalado a multi-instancia se resuelve migrando a Postgres** cambiando el
   adaptador del puerto. → PRD 02.
5. **Multi-tenancy = SOLO branding visual.** El journey y los módulos del
   producto son **iguales para todos los partners**; por partner cambian
   únicamente logo, colores, favicon, tipografía, **footer co-branded**
   (banco + Grupo Aval) y **textos/disclaimers legales**. → PRD 02.
6. **El panel admin (Back Office) NO existe en diseño aún** — se especifica
   desde cero. Los Figma son la **experiencia a re-brandear**, no el admin.
   → PRD 05.

---

## Referencia visual (Figma)

Los diseños de la **experiencia** (lo que se re-brandea) están en dos archivos
Figma, leídos vía MCP sobre copias en la cuenta del equipo. **Ambos son el
mismo journey operado siempre por un asesor** — no hay canal de cliente
autónomo:

> **Premisa:** la compra la ejecuta **siempre un asesor** (contacta al cliente
> por teléfono, toma sus datos y compra en el sistema). El **cliente final
> NUNCA interactúa con el sistema**. Único canal: **asistido por asesor**.

| Referencia | fileKey | node raíz | Descripción |
|------------|---------|-----------|-------------|
| `-BP-` | `AfEpPhGEPF9wbCZFX9ZRQ6` | `69:2308` | Superficie del journey operado por el asesor |
| `-BO-` | `8igWn4MXoho4WHWtmT1LWt` | `12286:171401` | Mismo journey operado por el asesor |

**Journey observado (idéntico para todos los partners; siempre operado por el asesor):**
`Web login → Doble login → Home → `
[Conoce a tu cliente (KYC)](./09-page-conoce-a-tu-cliente.md)
` → Datos del cliente → Declaración de salud → Ofrecimiento del seguro →
Agendamiento cita médica → Selección de beneficiarios → Resumen/Confirmación →
OTP y TyC → Medio de pago + Activación → Activar beneficios digitales →
Comunicaciones postventa → Desistir de la venta`.

Cada paso se especifica en su propio PRD conforme se aborda; ver
[Serie de páginas del journey (09+)](#serie-de-páginas-del-journey-09).

**Modelo de co-branding observado:** logo del producto arriba (p. ej.
`Seguros Alfa`), footer co-branded del distribuidor (p. ej.
`banco popular · Grupo Aval`) + disclaimer de la **Superintendencia Financiera
de Colombia**.

---

## Restricciones de ingeniería (heredadas del repo)

Toda decisión técnica en estos PRDs respeta `.claude/ARCHITECTURE.md` y las
reglas inviolables de `.claude/CONSTITUTION.md`:

- Angular 20 standalone, **zoneless**, `OnPush`, signals.
- **NgRx SignalStore** solo estado síncrono; **TanStack Query** único estado
  de servidor/caché. Sin `axios` — solo `HttpClient`.
- **Tailwind v4** como única solución de estilos.
- `inject()`, servicios `providedIn: 'root'`.
