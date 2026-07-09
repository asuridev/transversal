# Contract: Front — DTO de sesión + guard de scope (UX, no frontera)

**Feature**: `007-aislamiento-asesor-partner` · **Fase**: 1 · Decisiones: D6, D7
**Cubre**: FR-002, US1 · **Módulos**:
`src/app/core/auth/{auth-model.ts, auth.store.ts}`,
`src/app/core/tenant/partner-scope-guard.ts`,
`src/app/features/auth/queries/auth-queries.ts`

El front **no** es la frontera de seguridad (esa es `journey-authz.contract.md`).
Aquí solo se evita **mostrar** una vista ajena y se enruta al asesor a su partner.
Cumple Const. I–IV.

---

## 1. Modelo y store (D7)

```ts
// auth-model.ts
interface AuthUser {
  subject: string; name: string; roles: readonly AppRole[];
  partnerSlug?: string;  // presente ⟺ asesor
}
// `partnerId`/`partnerKey` NO cruzan al cliente (009): el `partnerKey` es un
// secreto y el `partnerId` no tiene consumidor en el front; ambos se resuelven
// server-side desde la sesión sellada / el `partnerSlug`.

// auth.store.ts — computed síncronos (Const. §2)
partnerSlug = computed(() => this.user()?.partnerSlug ?? null);
isAsesor    = computed(() => this.partnerSlug() !== null);
```

- **Estado síncrono** de UI/sesión: reflejo del DTO de `GET /api/admin/session`,
  poblado en el `onSuccess` de `AuthQueries.session()` (patrón `006`).
- **No** guarda datos de servidor cacheables (eso es TanStack Query — Const. I).

---

## 2. DTO de sesión (contrato con el BFF, D7)

`AuthApiService.session()` / `AuthQueries.session()` tipa la respuesta de
`GET /api/admin/session`:

```ts
interface SessionDto {
  subject: string; name: string; roles: AppRole[];
  partnerSlug?: string;   // presente ⟺ asesor; `partnerId`/`partnerKey` no se exponen (009)
}
```

- `onSuccess(dto)` ⇒ `authStore.setUser({ …dto })`. El token del IdP nunca viaja;
  solo el partner ya resuelto server-side.
- `401` ⇒ el front inicia el flujo de login (navegación a `/api/auth/login`,
  reutilizado de `006`).

---

## 3. Guard `partnerScopeMatch` (D6, UX)

```ts
// partner-scope-guard.ts — CanMatchFn funcional (Const. II/III)
export const partnerScopeMatch: CanMatchFn = (_route, segments) => {
  const authStore = inject(AuthStore);
  const tenantStore = inject(TenantStore);
  const router = inject(Router);

  const sessionPartner = authStore.partnerSlug();     // partner del asesor (síncrono)
  const routeTenant = tenantStore.slug();             // tenant resuelto por PRD 01

  if (sessionPartner === null) return true;           // no-asesor ⇒ no aplica (admin/publico)
  if (routeTenant === sessionPartner) return true;    // coincide ⇒ permitir
  // desajuste: redirige a la vista del propio partner del asesor (UX)
  return router.parseUrl(`/${sessionPartner}`);       // o '/forbidden' según diseño de rutas
};
```

- Se **encadena tras `tenantMatch`** (PRD 01) en las rutas del journey del asesor
  (`*.routes.ts` / `app.routes.ts`): primero se resuelve el tenant, luego se
  compara con el partner de la sesión.
- **No es la frontera**: si el usuario forzara la navegación, el BFF rechaza igual
  (404/401, `journey-authz.contract`). El guard solo mejora la UX (redirección
  temprana en vez de un error tardío).
- Lee **solo stores síncronos** (`AuthStore`/`TenantStore`), sin `HttpClient`
  (Const. I). `inject()` (Const. III). Sin `NgZone`/`zone.js` (Const. IV).

### Casos de test (`partner-scope-guard.spec.ts`)

| `AuthStore.partnerSlug` | `TenantStore.slug` | Resultado |
|-------------------------|--------------------|-----------|
| `null` (admin/anónimo)  | `banco-a`          | `true` (no aplica) |
| `banco-a`               | `banco-a`          | `true` |
| `banco-a`               | `banco-b`          | `UrlTree` → `/banco-a` (o `/forbidden`) |

---

## 4. Composición de rutas

```
// rutas del journey del asesor (ilustrativo)
{
  path: ':slug',
  canMatch: [tenantMatch, partnerScopeMatch],   // ← PRD 01 + este guard
  loadChildren: () => …journey…
}
```

- El orden importa: `tenantMatch` puebla `TenantStore`; `partnerScopeMatch` lo
  compara con la sesión. Ambos funcionales (Const. II).

> **Recordatorio de altitud**: este contrato es UX. La garantía de aislamiento
> ("seguridad del lado del servidor" del enunciado) vive íntegramente en
> `journey-authz.contract.md` y `partner-claim.contract.md`.
