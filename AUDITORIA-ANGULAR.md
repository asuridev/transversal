# Auditoría de Implementación Angular — Proyecto `transversal`

**Fecha:** 2026-07-07
**Alcance:** frontend Angular 20 (`src/app`) — componentes, templates, signals, formularios, estado, HTTP, routing, SSR/hydration, zoneless, accesibilidad, estilos y testing.
**Relación con otros documentos:** complementa a `AUDITORIA-ARQUITECTURA.md` (misma fecha), que cubre arquitectura de sistema, BFF, persistencia y gobernanza. Donde un hallazgo se solapa, aquí se referencia (p. ej. "ver H3 de arquitectura") y se profundiza solo en el ángulo Angular.

---

## 1. Resumen ejecutivo

La implementación Angular es **de las más disciplinadas que se pueden encontrar en un proyecto de este tamaño**. Las reglas de la Constitución se cumplen casi al 100% de forma medible: 22 componentes standalone sin un solo `NgModule`, cero decoradores legacy (`@Input`/`@Output`/`@HostBinding`), cero `ngClass`/`ngStyle`, cero directivas estructurales legacy, cero `any`, cero constructor-DI, 100% Reactive Forms, zoneless real sin rastro de `zone.js`. La separación SignalStore (síncrono) / TanStack Query (servidor) es limpia, y el SSR con hydration + event replay + TransferState (tema y sesión) está resuelto con un nivel de cuidado poco común (siembra síncrona del `AuthStore` antes de los guards, `initialData` en queries para no re-fetchear lo que el servidor ya resolvió).

Los hallazgos reales son pocos y acotados: **una fuga de suscripción** (la única `.subscribe()` manual del repo, sin teardown), **un acceso a `document` global en el interceptor CSRF** que es una bomba SSR latente, un `computed` innecesariamente caro en el editor de marca, y una zona del código (`conoce-tu-cliente`) que se escribió "a pixel de Figma" saltándose el sistema de átomos y tokens que el propio proyecto construyó. El resto es afinado: títulos de página por vista, `staleTime` en las queries de admin, y cerrar los huecos de test en los componentes más nuevos.

**Veredicto:** no hay deuda estructural en el frontend. Las correcciones caben en 1-2 días y ninguna requiere rediseño.

---

## 2. Fortalezas (verificadas por conteo, no por impresión)

| Regla | Estado medido |
|---|---|
| Standalone sin `NgModule` ni `standalone: true` explícito (Const. §5) | 22/22 componentes ✅ |
| `ChangeDetectionStrategy.OnPush` (Const. §6) | 21/22 — única excepción: `app.ts` (ver A4) |
| `input()`/`output()`/`host` object — sin decoradores legacy (Const. §10) | 0 violaciones ✅ |
| Control flow nativo `@if/@for/@switch` — sin `*ngIf/*ngFor` | 0 violaciones ✅ |
| Sin `ngClass`/`ngStyle` (Const. §9) | 0 violaciones ✅ |
| `inject()` — sin constructor-DI (Const. §12) | 0 violaciones (los 3 `constructor()` existentes solo albergan `effect()`) ✅ |
| Sin `any` en código de producción | 0 ✅ (solo el helper de specs, ver arquitectura H11) |
| Reactive Forms — sin template-driven (Const. §8) | 100% `FormGroup`/`FormControl`; 0 `ngModel` ✅ |
| Zoneless (Const. §15) | `provideZonelessChangeDetection()` activo, `zone.js` fuera de `package.json`, 0 `detectChanges`/`markForCheck` en producción ✅ |
| SignalStore solo síncrono (Const. §2) | 3/3 stores (`ThemeStore`, `TenantStore`, `AuthStore`) sin HTTP ni `rxMethod` ✅ |
| TanStack Query como única capa async (Const. §3) | 4 archivos `queries/`, 0 componentes inyectando `HttpClient` ✅ |

Además:

- **SSR ejemplar.** `RenderMode.Server` universal (`app.routes.server.ts`), `provideClientHydration(withEventReplay())`, y TransferState en dos frentes: tema (`app.config.server.ts` → `app.config.ts:36-44` → `initialData` en `theme-queries.ts`) y sesión (`app.config.ts:49-57`, sembrada síncronamente **antes** de los guards — evita el FOUC de autorización). El `ThemeApplier` manipula el DOM vía `DOCUMENT` inyectado + `Title`/`Meta`, SSR-safe de libro.
- **Guards funcionales bien compuestos.** `canMatch: [tenantMatch, partnerScopeMatch]` para resolución de tenant (compartiendo caché vía `queryClient.ensureQueryData`), `canActivate: [authGuard, roleGuard(...)]` con factory variádica, y un `CanDeactivate` para descarte de cambios. Todos con spec.
- **TypeScript al máximo rigor.** `strict` + `noImplicitReturns` + `noPropertyAccessFromIndexSignature` + `strictTemplates` + `typeCheckHostBindings`.
- **Effects usados solo para lo que son.** Los 3 `effect()` del repo sincronizan con el DOM (theming); ninguno deriva estado que debería ser `computed`.
- **Buen uso de accesibilidad base.** SVGs decorativos con `aria-hidden`, `role="status"` + `aria-live="polite"` en feedback de guardado, labels con `sr-only` en el formulario KYC.

---

## 3. Hallazgos priorizados

### 🔴 Alto impacto

#### A1. Fuga de suscripción en `brand-editor` — la única `.subscribe()` manual del repo, sin teardown

**Evidencia:** `src/app/features/admin/components/brand-editor/brand-editor.ts:173`:

```ts
this.form.valueChanges.subscribe(() => this.formValueSignal.set(this.form.getRawValue()));
```

No hay `takeUntilDestroyed()`, no se guarda la `Subscription`, no hay `ngOnDestroy`. Cada vez que se monta un `brand-editor` (cada visita a `partner-edit`) queda una suscripción viva apuntando al componente destruido.

**Impacto:** fuga de memoria acumulativa en la sesión del panel admin (navegar entre partners monta/desmonta el editor repetidamente). Además, es exactamente el patrón puente Observable→signal para el que existe `toSignal`.

**Recomendación:** reemplazar el trío `formValueSignal` + `set` inicial + `subscribe` por:

```ts
private formValue!: Signal<...>;
ngOnInit(): void {
  this.form = buildForm(this.initialTheme());
  this.formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
    injector: this.injector, // ngOnInit está fuera del injection context
  });
}
```

o, mínimo, `takeUntilDestroyed(this.destroyRef)` en el pipe. Nota: hoy `toSignal`/`toObservable` tienen **0 usos** en el repo; este es el caso de uso canónico para introducirlos.

#### A2. `csrf-interceptor` accede a `document` global — bomba SSR latente

**Evidencia:** `src/app/core/interceptors/csrf-interceptor.ts:5-8`:

```ts
function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|; )csrf=([^;]*)/);
  ...
}
```

`document` es el global del navegador, sin `inject(DOCUMENT)` ni guard de plataforma. El interceptor corre también en el `HttpClient` del servidor (SSR). Hoy no explota **solo porque** la línea 13 deja pasar todo lo que no sea `POST/PATCH/PUT/DELETE` hacia `/api/admin|auth/*`, y el SSR actual solo emite GETs.

**Impacto:** el día que cualquier flujo SSR emita una mutación (o un `provideAppInitializer` futuro lo haga), el render del servidor revienta con `ReferenceError: document is not defined` — un fallo lejano a su causa y difícil de diagnosticar. Contrasta con `unauthorized-redirect-interceptor.ts`, que sí se guarda con `isPlatformBrowser` (el proyecto conoce el patrón; aquí se omitió).

**Recomendación:** dentro del interceptor (que sí es un injection context), leer la cookie vía DI:

```ts
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  ...
  const cookie = inject(DOCUMENT).defaultView ? inject(DOCUMENT).cookie : null;
  ...
};
```

(o `isPlatformBrowser(inject(PLATFORM_ID))` como en el interceptor hermano). Dos líneas, y el spec existente (`csrf-interceptor.spec.ts`) cubre la regresión.

#### A3. Mutaciones inline en componentes con `inject(AdminApiService)` — inconsistencia con el patrón ya establecido

**Evidencia:** `partner-edit.ts:25`, `partner-create.ts:42`, `partners-list.ts:21`, `asset-uploader.ts:141` inyectan `AdminApiService` y definen sus `injectMutation` con `mutationFn` inline. Mientras tanto, `auth-queries.ts:20` **sí** centraliza `logout()` como mutation options que `admin-layout.ts:93` consume — es decir, el patrón correcto ya existe y convive con el incorrecto. `admin-queries.ts` solo expone queries, ninguna mutación.

**Impacto:** el ángulo normativo (violación de Constitución §4) ya está reportado como **H3 de la auditoría de arquitectura** — no se repite aquí. El ángulo Angular es de mantenibilidad: la definición de invalidación de caché y efectos de una mutación queda dispersa por 4 componentes en lugar de junto a sus `queryKey` (que viven en `admin-queries.ts`); cualquier cambio de shape del DTO obliga a tocar componentes.

**Recomendación:** mover las `mutationFn` (y la invalidación por `queryKey`) a `AdminQueries` como métodos que devuelven mutation options, espejo exacto de `AuthQueries.logout()`. Los componentes quedan con `injectMutation(() => this.adminQueries.updateTheme(...))` y dejan de conocer `AdminApiService`.

### 🟡 Impacto medio

#### A4. `app.ts` — el único componente sin `OnPush`

**Evidencia:** `src/app/app.ts:6-11` — el `@Component` raíz no declara `changeDetection`. Es el único de los 22 (viola Constitución §6).

**Impacto:** funcionalmente menor en zoneless (el root apenas tiene template), pero es la Constitución incumplida en el archivo más visible del árbol — mal ejemplo para cada componente nuevo que se copie de ahí. De paso: `protected readonly title = signal('transversal')` (`app.ts:13`) no se usa en `app.html` — señal muerta del scaffold.

**Recomendación:** añadir `changeDetection: ChangeDetectionStrategy.OnPush` y eliminar la señal `title` sin uso.

#### A5. `isDirty` recomputa caro: reconstruye el `FormGroup` completo + doble `JSON.stringify`

**Evidencia:** `brand-editor.ts:193-199`:

```ts
readonly isDirty = computed<boolean>(() => {
  if (!this.form) return false;
  const initialValue = buildForm(this.initialTheme()).getRawValue();
  return JSON.stringify(initialValue) !== JSON.stringify(this.formValueSignal());
});
```

`buildForm(...)` instancia un `FormGroup` completo (con validators) en **cada recomputación**, solo para extraer su `getRawValue()`; y `formValueSignal` cambia con cada tecleo del editor, así que el computed se reevalúa constantemente mientras se edita.

**Impacto:** trabajo O(form) por keystroke en la pantalla más interactiva del panel. No se nota hoy; escalará mal con más tokens/campos.

**Recomendación:** el comentario del propio código (`brand-editor.ts:160-165`) establece que `initialTheme` es estable durante la vida del componente — entonces el snapshot inicial se calcula **una vez** en `ngOnInit` (`this.initialValue = this.form.getRawValue()` justo tras construir el form, más un `JSON.stringify` cacheado) y el computed solo serializa el lado que cambia.

#### A6. Sin títulos por vista ni features de `provideRouter`

**Evidencia:** `provideRouter(routes)` a secas (`app.config.ts:30`). Ninguna ruta define `title:`; no hay `TitleStrategy`. El título del documento lo fija solo `ThemeApplier.applyTitle()` (`theme-applier.ts:73-78`) con el `displayName` del partner — idéntico para todas las vistas de un tenant. Además `partner-edit.ts:30` lee `this.route.snapshot.paramMap.get('id')!` a mano cuando `withComponentInputBinding()` lo convertiría en un `input()`.

**Impacto:** accesibilidad/UX (historial, pestañas y lectores de pantalla no distinguen "Partners" de "Editar partner") y una oportunidad idiomática perdida (input binding elimina la dependencia de `ActivatedRoute` y el non-null assertion).

**Recomendación:** `provideRouter(routes, withComponentInputBinding())`; `title:` en las rutas de admin (`admin.routes.ts`) y una `TitleStrategy` custom que componga `"{título de vista} — {displayName del tenant}"` para conservar el theming actual del título.

#### A7. TransferState incompleto: los slugs de partners activos se re-piden en cliente

**Evidencia:** el tema y la sesión viajan por `TransferState` (ver Fortalezas), pero `tenantMatch` (`tenant-guard.ts:13`) resuelve los slugs activos vía `queryClient.ensureQueryData(...)`: en SSR consulta el repositorio directamente (`app.config.server.ts:39`), y en el navegador la caché de TanStack arranca vacía (la hydration de Angular no la transfiere), así que la **primera navegación cliente re-pide `GET /api/partners/active`** — dato que el servidor ya tenía al renderizar.

**Impacto:** un fetch redundante por sesión en la ruta pública más caliente. Menor, pero incoherente con el esmero de TransferState en tema/sesión.

**Recomendación:** aplicar el mismo patrón ya existente: `writePartnersTransferState` en el initializer server + siembra de la queryCache (`queryClient.setQueryData(['partners','active'], ...)`) en un initializer cliente, igual que `readThemeTransferState`/`initialData` en `theme-queries.ts`.

#### A8. `admin-queries.ts` sin `staleTime` — refetch agresivo en el panel

**Evidencia:** `admin-queries.ts:12-24` no define `staleTime` (default 0: todo dato es stale al instante, refetch en cada mount/focus). Contrasta con `theme-queries.ts` (5 min/30 min) y `partners-queries.ts` (`staleTime` de environment).

**Impacto:** cada navegación lista⇄detalle en el panel re-pide datos que acaban de llegar; combinado con el N+1 del BFF en el listado (arquitectura H5), multiplica queries innecesarias.

**Recomendación:** `staleTime` explícito y corto (30-60 s) — el panel ya invalida por `queryKey` tras cada mutación, así que la frescura tras escrituras está garantizada por invalidación, no por refetch de foco.

#### A9. Gaps de test en lo más nuevo

**Evidencia:** 32 specs con buena cobertura de stores (3/3), guards (4), interceptors (2/2), APIs y queries. Sin spec: **`partner-edit`** (el componente más orquestador: 3 mutaciones, `viewChild` del editor, contrato con el guard de descarte), `partner-edit-guard` (canDeactivate), `partner-shell`, `conoce-tu-cliente`, `notification-service`, `toast-host`, `forbidden`, `brand-logo` y los 7 átomos de `shared/ui/*`.

**Impacto:** la cobertura sigue un patrón claro: las features 001-006 están testeadas, las piezas de 007-009 (las más recientes y en evolución) no. Es la ventana de riesgo típica: código nuevo + sin red.

**Recomendación:** priorizar `partner-edit` + `partner-edit-guard` (contrato `hasUnsavedChanges()`/`isDirty()` entre ambos — justo donde A1 y A5 tocan) y `notification-service` (lógica de timeout). Los átomos de `shared/ui` pueden esperar a que se toquen.

#### A10. `asset-uploader.ts` concentra demasiadas responsabilidades (257 líneas)

**Evidencia:** `features/admin/components/asset-uploader/asset-uploader.ts` — en un solo archivo: `ControlValueAccessor`, lectura de archivo, validación MIME/tamaño, mutación de upload, cache-busting, notificaciones y un template inline de ~75 líneas (el proyecto define que templates complejos van a archivo separado — `.claude/CLAUDE.md`, Components).

**Recomendación:** extraer template a `asset-uploader.html` y la validación de archivo a una función pura testeable (`validate-asset-file.ts`) junto al componente. La mutación se va a `AdminQueries` con A3.

### 🟢 Impacto bajo (oportunistas)

#### A11. `conoce-tu-cliente`: la pantalla que se saltó el sistema de diseño propio

**Evidencia** (`features/partner-shell/conoce-tu-cliente/conoce-tu-cliente.html`):
- Hex hardcodeados fuera de tokens: `text-[#b3b3b3]` (:3), `text-[#313a43]` (:82, :91), `disabled:bg-[#cccccc]` (:108) — anotados como "(Figma)" en comentarios, pero el resto de la misma pantalla sí usa tokens (`bg-hero-surface`, `text-text-muted`, `bg-primary`).
- Botón "Volver" (:3-8) **sin handler `(click)` ni routerLink** — botón inerte en producción.
- Los `<button>` (:3, :105) e inputs usan Tailwind ad-hoc en vez de los átomos `ui-button`/`text-input` que el resto del app consume (13 usos de `ui-button` en otras pantallas).
- Hero `<img>` (:28-33) con `[src]` dinámico sin `NgOptimizedImage`/`ngSrc` (regla de `.claude/CLAUDE.md`; no es base64, así que no aplica la exención).
- Estructural: la página vive en `features/partner-shell/conoce-tu-cliente/`, sin la carpeta `pages/` que `ARCHITECTURE.md` §1 prescribe (`pages/<page-name>/<page-name>.ts`).

**Impacto:** es la pantalla pública themeada por partner — exactamente donde los hardcodes duelen (misma lógica que arquitectura H10, que ya reportó los del header en `partner-shell.ts`). Y el botón inerte es un bug de UX visible.

**Recomendación:** promover los 3 hex a tokens con default (patrón `colorFooterSurface`), cablear o eliminar "Volver", migrar a átomos compartidos y `ngSrc`, mover a `pages/`. Si el pixel-perfect de Figma exige esos grises, la respuesta del propio sistema es: nuevos tokens con esos defaults, no valores inline.

#### A12. Micro-limpiezas

- `brand-editor.html`: la clase de label `flex flex-col gap-1 text-xs text-admin-text-muted` repetida **27 veces** — candidato a átomo `ui-field-label` (la regla anti-duplicación de `ARCHITECTURE.md` §5 aplica).
- Radios arbitrarios repetidos entre templates (`rounded-[4px]`×3, `rounded-[5px]`×3, `rounded-[8px]`×2) — candidatos a la escala de Tailwind o a tokens.
- `auth.store.ts:37` — `hasAnyRole(...)` como método imperativo es válido, pero los consumidores en templates lo reevaluarían por CD; si se llega a usar en template, convertir en `computed`.
- Budgets de `angular.json` solo cubren `initial` y `anyComponentStyle`; al crecer los chunks lazy del admin conviene un budget `bundle` por chunk nombrado.

---

## 4. Hoja de ruta recomendada

| # | Acción | Esfuerzo | Retorno |
|---|--------|----------|---------|
| 1 | **A1** — `toSignal`/`takeUntilDestroyed` en `brand-editor` | 30 min | Elimina la única fuga de memoria conocida |
| 2 | **A2** — `DOCUMENT` inyectado en `csrf-interceptor` | 30 min | Desactiva la bomba SSR latente |
| 3 | **A3 + A8** — mutaciones a `AdminQueries` + `staleTime` (cierra también H3 de arquitectura) | ½-1 día | Restaura Constitución §4 y ordena la capa de datos del panel |
| 4 | **A4 + A5** — OnPush en `app.ts`, `isDirty` barato | 1 h | Constitución al 100%, editor fluido |
| 5 | **A6** — `withComponentInputBinding` + `title:`/`TitleStrategy` | ½ día | A11y/UX de navegación |
| 6 | **A9** — specs de `partner-edit` + guard + `notification-service` | 1 día | Red de seguridad donde tocan los puntos 1, 3 y 4 |
| 7 | **A7, A10, A11, A12** — oportunistas | al tocar cada zona | Coherencia del sistema de diseño y SSR completo |

Núcleo (1-6): **~2-3 días**. Todo es acotado; nada requiere migración ni rediseño.

## 5. Qué NO hacer

- **No** introducir NgRx Effects/Store clásico ni mover datos de servidor a los SignalStores — la división actual es idiomática y este informe lo confirma empíricamente (0 violaciones).
- **No** reemplazar TanStack Query ni "envolverlo" en una capa propia — el ajuste necesario es de convención (dónde viven las mutaciones), no de herramienta.
- **No** añadir una librería de componentes UI para resolver A11/A12 — `shared/ui/` con variantes + tokens ya es la solución; solo falta usarla consistentemente.
- **No** convertir los 3 `effect()` existentes en otra cosa — son side-effects de DOM legítimos, el uso correcto del API.
- **No** adoptar `RenderMode.Prerender` — la decisión de SSR dinámico está justificada (el set de partners cambia sin redeploy, spec 003).

La conclusión es la misma que la de arquitectura, aplicada al frontend: **la implementación ya es correcta; el trabajo es pulir los 4-5 puntos donde el código más reciente se desvió del estándar que el propio proyecto fijó.**

---

*Auditoría generada por lectura directa de `src/app` completo (22 componentes, 3 stores, 4 capas de queries, guards, interceptors, theming, SSR wiring, 32 specs) y configuración (`angular.json`, `tsconfig.json`, `app.config.ts`/`.server.ts`), contrastada contra `.claude/CONSTITUTION.md`, `.claude/ARCHITECTURE.md` y `.claude/CLAUDE.md`. Los conteos de violaciones (0 `ngClass`, 0 `any`, etc.) provienen de búsquedas exhaustivas por patrón, no de muestreo.*
