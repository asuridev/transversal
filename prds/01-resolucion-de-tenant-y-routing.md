# PRD 01 — Resolución de Tenant y Routing

> **Depende de:** [00 Visión y alcance](./00-vision-y-alcance.md).
> **Habilita:** [02 Modelo/Theme](./02-modelo-de-partner-y-contrato-de-theme.md),
> [03 Theming](./03-theming-dinamico-y-anti-fouc.md),
> [04 BFF](./04-arquitectura-bff.md).

---

## 1. Objetivo

Definir **cómo la aplicación resuelve qué partner (banco) corresponde a partir
de la URL**, cómo mapea ese segmento a un `partnerSlug`, cómo convive con las
rutas del Back Office y de la API, y qué ocurre cuando el segmento no matchea
ningún partner activo (**fallback a theme default**).

---

## 2. Decisión: **path prefix**

`https://app.com/{partnerSlug}/...`

El **primer segmento del path** identifica al partner. Es la decisión fijada
(decisión 1 del PRD 00). Alternativas evaluadas abajo (§7).

Ejemplos:

```
https://app.com/popular/oferta        → partner "popular"
https://app.com/popular/beneficiarios → partner "popular"
https://app.com/otrobanco/oferta      → partner "otrobanco"
https://app.com/admin                 → Back Office (ruta reservada)
https://app.com/api/theme/popular     → BFF (ruta reservada)
https://app.com/                      → landing / selector / theme default
```

### Por qué path prefix

- **Un solo dominio y un solo certificado TLS** — nada de DNS wildcard ni
  certificados por banco.
- **Deploy trivial** — agregar un banco es solo config (decisión 5, PRD 00):
  no toca infraestructura de red.
- **Links fáciles de compartir y de generar** desde el Back Office.
- Encaja con el routing lazy de Angular descrito en `ARCHITECTURE.md` §4.

---

## 3. Contrato del resolver de tenant

El resolver es una función pura y testeable (requisito de tests, PRD 00 §7):

```
resolveTenant(pathname: string): TenantResolution
```

```typescript
// shape conceptual (el código real se define en implementación)
type TenantResolution =
  | { kind: 'partner'; slug: string }         // primer segmento matchea un slug válido
  | { kind: 'reserved'; area: 'admin' | 'api' } // ruta reservada, no es partner
  | { kind: 'root' }                          // "/" sin segmento
  | { kind: 'fallback'; reason: 'unknown-slug' | 'inactive' };
```

### Reglas de normalización del slug

1. **Lowercase** y `trim`.
2. Solo `[a-z0-9-]` (kebab-case). Cualquier otro carácter → no matchea.
3. Longitud 2–40.
4. Se compara contra la **lista de slugs de partners activos** (fuente: PRD 02,
   servida por el BFF, PRD 04). La validez final (activo/inactivo) la decide el
   estado del partner, no el resolver por sí solo.

### Slugs reservados (no asignables a un partner)

`admin`, `api`, `assets`, `static`, `health`, `_next`, `favicon.ico`, `robots.txt`.
El Back Office **valida contra esta lista al crear un partner** (PRD 05) para
evitar colisiones de ruteo.

---

## 4. Composición de routing (Angular)

Siguiendo `ARCHITECTURE.md` §4 (lazy `loadChildren`/`loadComponent`, guards en
capas):

```typescript
// app.routes.ts (conceptual)
export const routes: Routes = [
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },
  {
    // el partner es un parámetro de ruta: :partnerSlug
    path: ':partnerSlug',
    // un resolver/guard valida el slug y carga el theme antes de activar
    canActivate: [tenantGuard],
    resolve: { theme: themeResolver },   // ver PRD 03
    loadChildren: () => import('./features/journey/journey.routes').then(m => m.JOURNEY_ROUTES),
  },
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then(m => m.Landing),
  },
  {
    path: '**',
    loadComponent: () => import('./features/landing/landing').then(m => m.Landing),
    // con theme default (fallback)
  },
];
```

- **`tenantGuard`** (`CanActivateFn`): lee `:partnerSlug`, consulta la lista de
  partners activos (vía TanStack Query → BFF), y decide activar o redirigir a
  fallback. No inyecta `HttpClient` directo (Constitución regla 4).
- **`themeResolver`**: garantiza que el theme esté disponible antes de
  renderizar (detalle en PRD 03).
- `/admin` se declara **antes** que `:partnerSlug` para que gane la ruta
  reservada aunque `admin` pasara la normalización.

---

## 5. Fallback a theme default

Cuando `resolveTenant` devuelve `{ kind: 'fallback' }` (slug desconocido o
partner inactivo):

1. Se aplica el **theme default** de la plataforma (definido en PRD 02/03).
2. **Comportamiento configurable** (decisión de producto, default recomendado):
   - **Recomendado:** renderizar una **landing neutra** con theme default y un
     mensaje claro ("Este enlace no corresponde a un socio activo"), sin
     exponer detalle interno.
   - Alternativa: redirigir `301/302` a `/` con theme default.
3. **Nunca** se filtra información de por qué falló (no revelar si el slug
   existe pero está inactivo vs. no existe) — respuesta uniforme.

---

## 6. SSR vs CSR

Como el BFF es Angular SSR (decisión 2, PRD 00):

- La **resolución de tenant ocurre primero en el servidor** durante el SSR: el
  server ya conoce el `partnerSlug`, resuelve el theme y **lo inyecta en el HTML
  inicial** (base del anti-FOUC, PRD 03).
- En el cliente, el resolver se re-ejecuta de forma **idempotente** para la
  navegación SPA subsecuente (cambios de ruta dentro del mismo partner no
  requieren volver a pedir el theme — caché, PRD 03).
- El `partnerSlug` resuelto se expone a la app como **estado síncrono** (NgRx
  Signals, `core/store/`), no como dato de servidor (Constitución regla 2).

---

## 7. Alternativas evaluadas

| Criterio | **Path prefix** (elegido) | Subdominio (`popular.app.com`) | Híbrido (ambos) |
|----------|---------------------------|-------------------------------|-----------------|
| DNS / TLS | 1 dominio, 1 cert | wildcard DNS + cert wildcard | ambos, más complejo |
| Deploy nuevo partner | solo config | config + (a veces) DNS | config + DNS |
| Aislamiento de cookies/origen | compartido | por origen (mejor) | mixto |
| Compartir/generar links | trivial | requiere subdominio válido | ambos |
| Complejidad de testeo | baja | media | alta |
| SEO / branding percibido | bueno | muy bueno | bueno |

**Veredicto:** path prefix maximiza velocidad de onboarding y simplicidad
operativa, que es la prioridad (decisión 5, PRD 00). Subdominio queda como
**evolución futura** si se necesita aislamiento de origen por banco; el
contrato `resolveTenant` se diseña para **poder aceptar host + pathname** en el
futuro sin reescribir consumidores (extensible al modo híbrido).

---

## 8. Requisitos funcionales

- **RF-01.1** El primer segmento del path resuelve el `partnerSlug`.
- **RF-01.2** Normalización estricta (lowercase, kebab, longitud, charset).
- **RF-01.3** Rutas reservadas (`/admin`, `/api`, …) nunca se interpretan como
  partner.
- **RF-01.4** Slug desconocido o partner inactivo → fallback a theme default,
  con respuesta uniforme (sin revelar causa).
- **RF-01.5** La lista de partners activos se obtiene del BFF (PRD 04) vía
  TanStack Query, cacheada (PRD 03).
- **RF-01.6** La resolución ocurre en SSR y se re-ejecuta idempotente en
  cliente.

---

## 9. Criterios de aceptación

- [ ] `app.com/popular/oferta` resuelve partner `popular` y aplica su theme.
- [ ] `app.com/admin` entra al Back Office, nunca se trata como partner.
- [ ] `app.com/no-existe/x` renderiza landing con theme default y mensaje
      neutro, sin errores en consola ni fugas de info.
- [ ] Un partner **inactivo** se comporta como slug desconocido (respuesta
      uniforme).
- [ ] Tests unitarios del resolver cubren: slug válido, reservado, root,
      desconocido, inactivo, charset inválido, longitud fuera de rango.
- [ ] Navegación SPA entre pasos del journey del mismo partner **no** re-pide
      el theme (usa caché).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Un slug nuevo colisiona con una futura ruta reservada | Lista de reservados versionada; validación en alta (PRD 05). |
| Enumeración de partners por fuerza bruta de slugs | Respuesta uniforme en fallback; rate limiting en el BFF (PRD 04/07). |
| Desalineación SSR/CSR (theme distinto server vs client) | Resolver puro y determinista; misma fuente de verdad (BFF + caché). |
