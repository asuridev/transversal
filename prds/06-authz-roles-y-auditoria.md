# PRD 06 — AuthZ, Roles y Auditoría (Back Office)

> **Depende de:** [04 BFF](./04-arquitectura-bff.md) (valida el token),
> [05 Back Office](./05-back-office-gestion-de-partners.md) (superficie a
> proteger y a auditar), [02 Modelo/Theme](./02-modelo-de-partner-y-contrato-de-theme.md)
> (versionado que alimenta la auditoría).
> **Habilita:** cierre de seguridad del Back Office; insumo de compliance.

---

## 1. Objetivo

Definir la **autenticación y autorización de los usuarios internos** del Back
Office vía **SSO corporativo (OIDC/SAML)**, el mapeo de claims a **roles**, la
protección de rutas/endpoints admin, y la **auditoría** (quién cambió qué y
cuándo) requerida por trazabilidad y compliance.

---

## 2. Decisión: SSO corporativo (OIDC/SAML)

(Decisión 3, PRD 00.) Los usuarios internos se autentican contra el **IdP
corporativo** (Azure AD / Keycloak / equivalente). El Back Office **no**
gestiona usuarios ni contraseñas propias.

### Flujo (OIDC Authorization Code + PKCE, mediado por el BFF)

```
1. Usuario entra a /admin  ──►  BFF detecta sin sesión  ──►  redirige al IdP
2. IdP autentica (corp)     ──►  callback con code
3. BFF intercambia code por tokens (server-side; client_secret en secret mgr)
4. BFF crea sesión (cookie httpOnly, SameSite=strict) — el access token NO va al browser
5. Front (Angular) opera con la cookie de sesión; el BFF valida en cada /api/admin/*
```

- **El access/ID token del IdP nunca llega al browser** (coherente con PRD 04:
  nada sensible cruza al cliente). El front solo tiene una **cookie de sesión
  httpOnly** emitida por el BFF.
- El `client_secret` de OIDC vive en el **secret manager** (PRD 04 §5).
- El BFF valida la firma del token (JWKS del IdP), expiración y audiencia.

> **Nota vs. `auth-interceptor` de ARCHITECTURE.md §3:** ese interceptor
> adjunta un `Bearer` desde `AuthStore` para APIs que lo requieran. Para el
> Back Office se prefiere **cookie de sesión httpOnly** (el token no toca el
> JS). Ambos conviven: el interceptor se usa donde aplique; los `/api/admin/*`
> se autentican por cookie de sesión validada en el BFF.

---

## 3. Roles

Los roles llegan como **claim del IdP** (p. ej. `roles: ["partner-admin"]`),
mapeados a roles de la aplicación:

| Rol app | Permisos |
|---------|----------|
| `platform-admin` | Todo: crear/editar/publicar/desactivar partners, ver auditoría, gestionar theme default. |
| `partner-editor` | Crear/editar/publicar branding de partners; sin gestión de theme default ni de otros admins. |
| `auditor` | Solo lectura: listado de partners y **auditoría**; no muta nada. |

- El mapeo claim→rol se centraliza en el BFF (config, no hardcode).
- Principio de **menor privilegio**: por defecto, sin rol reconocido → sin
  acceso (403).

---

## 4. Protección de rutas y endpoints

### Front (Angular) — guards en capas (`ARCHITECTURE.md` §4)

```typescript
// features/admin/admin.routes.ts (conceptual)
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],                     // hay sesión válida
    children: [{
      path: '',
      canActivate: [roleGuard('platform-admin', 'partner-editor', 'auditor')],
      loadComponent: () => import('./layouts/admin-layout').then(m => m.AdminLayout),
      children: [ /* pages: list, create, edit... */ ],
    }],
  },
];
```

- `authGuard`: verifica sesión (estado en `AuthStore`, NgRx Signals síncrono,
  `ARCHITECTURE.md` §2).
- `roleGuard(...roles)`: variante parametrizada del ejemplo de
  `ARCHITECTURE.md` §4; redirige a `/forbidden` si el rol no basta.
- Acciones sensibles (publicar, desactivar) se **re-verifican en el BFF** — el
  guard del front es UX, no la frontera de seguridad real.

### BFF — autorización real

Cada `/api/admin/*` valida sesión + rol **en el server** (defensa efectiva). El
front nunca es la única barrera. 401 sin sesión; 403 con sesión pero sin rol.

---

## 5. Auditoría (quién / qué / cuándo)

Toda mutación del Back Office se registra en `audit_log` (PRD 02 §5),
apoyándose en el **versionado de theme** (PRD 02 §4):

```typescript
interface AuditEntry {
  id: string;
  entity: 'partner' | 'partner_theme';
  entityId: string;
  action: 'create' | 'update' | 'publish' | 'deactivate' | 'activate';
  actorSub: string;        // sub del usuario del IdP
  actorName: string;       // displayName para lectura humana
  at: string;              // ISO-8601
  diff: Record<string, { from: unknown; to: unknown }>; // cambios concretos
  themeVersion?: number;   // versión resultante (si aplica)
}
```

- **Inmutable**: solo append; nunca update/delete de entradas de auditoría.
- **Consultable** desde el Back Office (rol `auditor`/`platform-admin`) vía
  `GET /api/admin/audit`, con filtros por partner, actor y rango de fechas.
- Cada publicación de theme deja rastro con la `version` (PRD 02) → se puede
  reconstruir el "estado de marca vigente en la fecha X".

---

## 6. Requisitos funcionales

- **RF-06.1** Autenticación de usuarios internos vía SSO OIDC/SAML mediado por
  el BFF.
- **RF-06.2** El token del IdP no llega al browser; el front usa cookie de
  sesión httpOnly.
- **RF-06.3** Roles derivados de claims del IdP; menor privilegio por defecto.
- **RF-06.4** Rutas admin protegidas por `authGuard → roleGuard(...)` en el
  front **y** re-verificadas en el BFF.
- **RF-06.5** Toda mutación genera una entrada de auditoría inmutable
  (actor/acción/fecha/diff).
- **RF-06.6** La auditoría es consultable con filtros y ligada al versionado de
  theme.

---

## 7. Criterios de aceptación

- [ ] Entrar a `/admin` sin sesión redirige al IdP y vuelve autenticado.
- [ ] El network tab del browser no muestra el access/ID token del IdP (solo
      cookie httpOnly).
- [ ] Un usuario con rol `auditor` ve el listado y la auditoría pero recibe 403
      al intentar publicar.
- [ ] Publicar un cambio de branding crea una entrada de auditoría con el diff
      exacto y la versión resultante.
- [ ] Las entradas de auditoría no se pueden editar ni borrar.
- [ ] Un `/api/admin/*` llamado sin sesión válida responde 401; con sesión pero
      sin rol, 403.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Robo de sesión (XSS) | Cookie httpOnly + SameSite=strict + CSP; token nunca en JS. |
| CSRF en mutaciones admin | Token anti-CSRF / doble submit; SameSite estricto. |
| Escalada de privilegios por claim manipulado | Validación de firma JWKS en el BFF; mapeo claim→rol server-side. |
| Auditoría incompleta | Registro transaccional junto a la mutación (misma transacción del adaptador del puerto `PartnerRepository`; PRD 02 §5). |
| Desincronización de roles con RRHH/IdP | Roles siempre desde el IdP en cada login; sin cache larga de permisos. |
