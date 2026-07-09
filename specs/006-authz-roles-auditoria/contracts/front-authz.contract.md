# Contract: Front Angular — bootstrap de sesión, guards y CSRF

**Feature**: `006-authz-roles-auditoria`. Extiende los seams de
`src/app/core/auth/` y añade el interceptor CSRF. Cumple Constitución I–IV.
Ver `research.md` D10, `data-model.md` §8.

---

## 1. `AuthStore` (NgRx Signals, síncrono — Const. §2)

`src/app/core/auth/auth.store.ts`:

```ts
interface AuthUser { subject: string; name: string; roles: readonly AppRole[]; }
//                     ▲ era { subject, role: string } — se generaliza a lista

// métodos/computed añadidos:
isAuthenticated: computed(() => user() !== null)   // ya existe
hasAnyRole(...roles: AppRole[]): boolean            // NUEVO — para roleGuard variádico
setUser(user: AuthUser | null): void                // ya existe (poblado por la query de sesión)
```

- Estado **síncrono** de sesión/rol; **no** cachea datos de servidor (eso es
  TanStack Query). Se puebla en el `onSuccess` de la query de sesión (§4).

## 2. `authGuard` (sin cambios de forma)

`src/app/core/auth/auth-guard.ts`: sigue exigiendo `AuthStore.isAuthenticated()`;
si no ⇒ `UrlTree('/forbidden')` (o dispara login, §5). Lee estado síncrono.

## 3. `roleGuard` → variádico

`src/app/core/auth/role-guard.ts` (hoy `roleGuard(role: string)`):

```ts
export const roleGuard = (...roles: AppRole[]): CanActivateFn => () => {
  const auth = inject(AuthStore);
  return auth.hasAnyRole(...roles) || inject(Router).createUrlTree(['/forbidden']);
};
```

Uso en `features/admin/admin.routes.ts` (PRD 06 §4):

```ts
canActivate: [authGuard],
children: [{
  path: '',
  canActivate: [roleGuard('platform-admin', 'partner-editor', 'auditor')],
  // ... layout + pages
}]
```

> El guard de front es **UX**, no la frontera de seguridad — la autorización real
> vive en el BFF (`admin-authz.contract.md`). Ambos coexisten (FR-006).

## 4. Bootstrap de sesión vía TanStack Query (Const. I)

```
AuthApiService.getSession()  →  GET /api/admin/session   (services/auth-api.ts — envuelve HttpClient)
AuthQueries.session()        →  queryOptions(['auth','session'])   (queries/auth-queries.ts)
componente raíz / initializer: injectQuery(session).onSuccess → AuthStore.setUser(dto)
```

- Ningún componente/guard inyecta `HttpClient` (Const. I): la sesión se resuelve
  por `queries/ → AuthApiService → HttpClient`, y el resultado se vuelca al Store
  (patrón login de ARCHITECTURE §3).
- `401` de `/session` ⇒ no autenticado ⇒ flujo de login (§5).

## 5. Inicio de login

Como el flujo OIDC es **server-mediated**, "ir al login" = navegación del
browser a `GET /api/auth/login` (redirección 302 al IdP). El front no maneja
tokens. Un `error-interceptor` (o el manejador de la query) que reciba `401` en
`/api/admin/*` redirige `window.location` a `/api/auth/login?returnTo=<ruta>`
(SC-001, US1 esc.4).

## 6. Interceptor CSRF (Const. I, D4)

`src/app/core/interceptors/csrf-interceptor.ts` (`HttpInterceptorFn`, registrado
en `app.config.ts` vía `withInterceptors`):

- En métodos mutantes (`POST/PATCH/PUT/DELETE`) hacia `/api/admin/*`, lee la
  cookie `csrf` y añade header `X-CSRF-Token`. GET sin cambios.
- Funcional + `inject()` (Const. III). Sin `axios` (Const. I).

## 7. Página `/forbidden`

`src/app/features/admin/pages/forbidden/forbidden.ts` ya existe (US2 esc.4). Se
reutiliza como destino de `authGuard`/`roleGuard` denegados. Standalone + OnPush
(Const. II), Tailwind (Const. IV).

## 8. Conformidad con la Constitución

| Principio | Cumplimiento |
|-----------|--------------|
| I (estado sync/async) | sesión = TanStack Query → `AuthStore` síncrono; sin `HttpClient` en componentes/guards; sin axios |
| II (standalone/OnPush) | `forbidden` y cualquier UI nueva standalone + OnPush, Reactive Forms, `input()`/`output()` |
| III (DI) | `inject()`; `AuthApiService`/`AuthQueries` `providedIn:'root'` |
| IV (estilos/zoneless) | Tailwind único; guards/interceptor sin `NgZone`/`zone.js`; reactividad por signals |
</content>
