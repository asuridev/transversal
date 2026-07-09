# Auditoría de Arquitectura — Proyecto `transversal`

**Fecha:** 2026-07-07
**Alcance:** Angular 20 SSR + BFF Express + SQLite (multi-tenant white-label para partners bancarios).
**Objetivo:** evaluar si el proyecto puede **crecer y mantenerse de manera económica**, detectar malas prácticas, refactorizaciones posibles y recomendaciones de escalabilidad.

---

## 1. Resumen ejecutivo

El proyecto está **notablemente bien construido para su etapa**. Tiene gobernanza escrita (`CONSTITUTION.md`, `ARCHITECTURE.md`, PRDs y specs por feature), una arquitectura feature-first disciplinada, separación limpia de estado síncrono vs. asíncrono, un BFF con puertos y adaptadores, y ~60 archivos de test que cubren guards, interceptors, routers y persistencia (incluyendo un contract test del repositorio).

**El riesgo principal no está en el código: está en que ninguna de sus propias reglas se verifica automáticamente.** No hay ESLint, no hay CI, no hay hooks de pre-commit. Hoy la disciplina se sostiene por convención (y por el agente que desarrolla); a medida que entren más manos, la deuda entrará por ahí. La segunda brecha real es la **validación de entrada en la frontera del BFF**, donde el body de las mutaciones de tema se persiste sin validar su schema.

De hecho, ya existen violaciones a la Constitución dentro del propio código (inyección directa de `*ApiService` en componentes) que nadie detectó — evidencia empírica de que las reglas sin enforcement se degradan.

**Veredicto:** base sólida, seams correctos para escalar. Las inversiones de mayor retorno son automatización de calidad (lint + CI) y endurecimiento de fronteras, no reestructuraciones.

---

## 2. Fortalezas (no tocar: esto ya funciona)

Es importante enumerarlas para no "arreglar" lo que no está roto:

- **Gobernanza escrita y viva.** `.claude/CONSTITUTION.md` (reglas inviolables con prioridad explícita), `.claude/ARCHITECTURE.md` (estructura, estado, HTTP, routing, SSR), `prds/` y `specs/001..009` con plan, research, data-model y contratos por feature. Muy pocos proyectos de este tamaño tienen esto; es el activo #1 para mantenimiento económico.
- **Estructura feature-first coherente.** `core/` (singletons: auth, tenant, theme, interceptors, stores transversales), `features/` (admin, auth, landing, partners, partner-shell, theming), `shared/ui/` (átomos: badge, button, card, field-message, inputs), con regla de promoción "al segundo reuso". La estructura real coincide casi 1:1 con la documentada.
- **Separación de estado ejemplar.** NgRx SignalStore solo para estado síncrono (`AuthStore`, `ThemeStore`, `TenantStore`); TanStack Query para todo estado de servidor (`queries/` por feature). No hay datos de API modelados en stores.
- **Higiene Angular moderna impecable.** Zoneless + `OnPush` consistente, control flow nativo (`@if/@for/@switch`), `input()`/`output()`, `inject()`, standalone sin `standalone: true` explícito, **cero `any` en código de producción**, cero `ngClass`/`ngStyle`, lazy loading real por ruta (`app.routes.ts`).
- **BFF con arquitectura hexagonal ligera.** Composition root en `src/server.ts` (DI manual, resolución perezosa de secretos), puertos `PartnerRepository`, `AssetStorage`, `SecretResolver` con adaptadores intercambiables (SQLite hoy, migrable; local-fs hoy, cloud en M2), y un **contract test** (`partner-repository.contract-test.ts`) que cualquier implementación futura debe pasar. Este es exactamente el seam que permite crecer barato.
- **Seguridad razonable para la etapa.** CSRF (`requireCsrf`), roles default-deny (`requireRole`), sanitización de SVG server-side, keys de assets derivadas en el servidor (UUID + slot allowlist, sin path traversal), rate limiting en rutas públicas, sesión sellada (httpOnly), auditoría transaccional (BEGIN/COMMIT junto con la mutación).
- **Testing amplio y en el lugar correcto.** 32 `*.spec.ts` (Karma/Jasmine, frontend) + 28 `*.test.ts` (node:test, servidor). Cubren guards, interceptors, stores, routers de API, OIDC flow y persistencia — justo las áreas críticas.

---

## 3. Hallazgos priorizados

Cada hallazgo incluye evidencia, impacto sobre el costo de mantenimiento, y recomendación.

### 🔴 Alto impacto

#### H1. No hay enforcement automático de calidad: sin ESLint, sin CI, sin hooks

**Evidencia:** no existe `eslint.config.*` ni `.eslintrc*`, no hay dependencia de `angular-eslint` en `package.json`, no existe `.github/workflows/`, no hay husky/lint-staged. Prettier está configurado en `package.json` pero no hay script ni verificación que lo ejecute.

**Impacto:** las 16 reglas de la Constitución dependen 100% de disciplina humana. El hallazgo H3 (abajo) demuestra que ya se violan sin que nadie lo note. Cada desarrollador nuevo que entre multiplicará esta erosión. Este es, con diferencia, **el mayor riesgo para el "crecimiento económico"** que pide el proyecto: la deuda no se previene, solo se descubre tarde.

**Recomendación (en orden):**
1. Añadir `angular-eslint` (`ng add angular-eslint`). Varias reglas de la Constitución ya existen como reglas de lint listas: `@angular-eslint/prefer-on-push-component-change-detection`, `@angular-eslint/prefer-standalone`, `@angular-eslint/template/prefer-control-flow`, `@angular-eslint/no-host-metadata-property` (invertida), `@typescript-eslint/no-explicit-any`, y `no-restricted-imports` para vetar `axios`, `zone.js` y `NgZone`.
2. Regla `no-restricted-syntax`/import boundaries para la Constitución §4 (componentes que importan `*ApiService`) — o adoptar `eslint-plugin-boundaries` para las fronteras feature/core/shared/server.
3. Script `"lint"` y `"format:check"` en `package.json`.
4. Pipeline CI mínimo (GitHub Actions): `npm ci && npm run lint && npm test -- --watch=false && npm run test:server && npm run build`. Un solo archivo YAML, retorno enorme.
5. Opcional: husky + lint-staged para feedback pre-commit.

#### H2. Frontera del BFF sin validación de schema: `req.body` casteado `as never` y persistido

**Evidencia:** `src/server/api/admin-router.ts:153` (POST `/partners`, `firstTheme`) y `:171-178` (PATCH `/partners/:id`):

```ts
const theme = await deps.partnerRepository.saveThemeVersion(
  String(req.params['id']),
  { ...(req.body as Record<string, unknown>), createdBy: ... } as never,  // ⚠️
  req.adminSession?.name,
);
```

El body llega tipado como `NewThemeVersion` solo por casteo; `tokens/assets/legal/typography` se serializan a JSON y se guardan **sin validar estructura, tipos ni contenido**. Ese JSON luego se deserializa (`rowToTheme`) y se aplica como CSS variables / assets / textos legales en las pantallas públicas del partner.

**Impacto:** (a) corrupción de datos silenciosa — un cliente con un bug guarda un theme malformado y la pantalla pública del partner rompe en runtime, no en el POST; (b) superficie de inyección — valores arbitrarios acaban en CSS vars y en render de textos legales (el pipeline de theme del cliente mitiga parte, pero la defensa autoritativa debe estar en la frontera, como ya hace el propio proyecto con los assets: `validateBrandAsset` + `sanitizeSvg`); (c) los `as never` anulan al compilador exactamente donde más se le necesita.

**Recomendación:** validadores por DTO en la frontera, siguiendo el patrón que ya existe en `src/server/persistence/slug-validation.ts` (validador puro + resultado tipado, testeado). Un `validateNewThemeVersion(body): { ok: true; value: NewThemeVersion } | { ok: false; error }` que verifique shape, tipos, longitudes y formato de colores/URLs. No hace falta introducir zod si se quiere mantener cero dependencias — el patrón manual actual escala bien para los ~4 DTOs que hay; si los DTOs crecen, zod en `src/shared/` (isomórfico: mismo schema valida en el form del admin y en el BFF) es la evolución natural. Eliminar todo `as never`.

#### H3. Violación activa de la Constitución §4 + contradicción entre documentos

**Evidencia:** la Constitución §4 dice *"Los componentes nunca inyectan `HttpClient` ni un `*ApiService` directamente"*, y `admin-api.ts:21` lo repite en su doc-comment. Sin embargo:

- `src/app/features/admin/pages/partner-create/partner-create.ts:42` — `inject(AdminApiService)`
- `src/app/features/admin/pages/partner-edit/partner-edit.ts:25` — `inject(AdminApiService)`
- `src/app/features/admin/pages/partners-list/partners-list.ts:21` — `inject(AdminApiService)`
- `src/app/features/admin/components/asset-uploader/asset-uploader.ts:141` — `inject(AdminApiService)` + `firstValueFrom` imperativo

Y para rematar: **el propio ejemplo de `ARCHITECTURE.md` §3** (componente `Login`) muestra `private authApi = inject(AuthApiService)` dentro de un componente — el documento de arquitectura contradice a la Constitución que dice implementar.

**Impacto:** más allá del caso puntual (el patrón usado — ApiService dentro de `injectMutation` — es funcionalmente razonable), el daño real es **normativo**: una regla "inviolable" que se viola en 4 archivos y en el propio manual enseña que las reglas son negociables. Eso encarece cada revisión futura ("¿esta regla sí aplica o es como la §4?").

**Recomendación:** decidir y alinear las tres piezas:
- **Opción A (más limpia):** mover las mutaciones a `AdminQueries`/`AuthQueries` como métodos que devuelven mutation options (igual que ya hacen `admin-queries.ts` y el `logout()` que consume `admin-layout.ts:93`). Los componentes solo inyectan `*Queries`. La regla §4 queda intacta y se vuelve linteable (H1).
- **Opción B:** enmendar la Constitución §4 para permitir explícitamente `*ApiService` dentro de `injectMutation`. Menos trabajo, pero la regla se vuelve más difícil de verificar automáticamente.
- En cualquier caso, corregir el ejemplo de `ARCHITECTURE.md` §3 y el comentario de `admin-api.ts`.

### 🟡 Impacto medio

#### H4. Configuración de entornos incompleta y con default peligroso

**Evidencia:** solo existen `src/environments/environment.ts` y `environment.development.ts`. `ARCHITECTURE.md` §8 exige `environment.qa.ts` y `environment.production.ts` — no existen. Peor: `environment.ts` es **el archivo que se usa en el build de producción** (los `fileReplacements` de `angular.json` solo sustituyen en development) y contiene:

```ts
webviewLoginUrl: 'http://localhost:4300',
```

Además, el servidor consume ~10 variables de entorno (`OIDC_CLIENT_SECRET`, `SESSION_SEAL_KEY`, `WEBVIEW_LOGIN_URL`, `WEBVIEW_LOGIN_ORIGIN`, `SESSION_TTL_SECONDS`, `ASSET_STORAGE_DRIVER`, `ASSETS_DIR`, `PORT`, `NODE_ENV`, config de role-map/partner-claim) sin ningún `.env.example` que las documente.

**Impacto:** un build de producción hoy sale apuntando a localhost; el onboarding de cada entorno nuevo (QA, prod) requiere arqueología por el código del servidor para descubrir qué variables existen.

**Recomendación:** crear `environment.production.ts` (y `.qa.ts`) con sus `fileReplacements`; tratar `environment.ts` como el default seguro. Añadir `.env.example` versionado con todas las variables, comentadas, sin valores reales. Considerar un módulo `server/config.ts` que lea y valide **todo** `process.env` en un solo lugar al arrancar (fail-fast con mensaje claro), en vez de `process.env[...]` disperso.

#### H5. Lista de partners: N+1 en el BFF y búsqueda que se trunca silenciosamente

**Evidencia:** `src/server/api/admin-router.ts:73-92` — por cada partner listado se ejecutan `getThemeById()` + `secretResolver.isConfigured()` (N+1). Además `listPartners` en `sqlite-partner-repository.ts:195-214` aplica `limit ?? 50`, y la búsqueda de texto del panel (`partners-list.ts:30-38`) filtra **en memoria sobre esa página de 50**: con el partner #51, la búsqueda devuelve resultados incompletos sin ningún aviso.

**Impacto:** hoy con <10 partners es invisible. Es el tipo de bug que aparece en producción un año después y cuesta una tarde de debugging + un hotfix urgente. Arreglarlo ahora cuesta minutos.

**Recomendación:** (a) resolver el N+1 con un `JOIN` a `partner_themes` en `listPartners` (SQLite lo hace trivial) y un `isConfiguredBatch(slugs)` o cache en el resolver; (b) decidir explícitamente el contrato de la lista: o se pagina de verdad (pasar `query`/`limit`/`offset` del cliente al SQL, con `WHERE slug LIKE ? OR display_name LIKE ?`) o se elimina el `LIMIT 50` mientras el catálogo sea pequeño y se documenta el umbral. Lo que no debe quedar es el estado intermedio actual (límite server-side + filtro client-side).

#### H6. Deriva documental entre `ARCHITECTURE.md` y el código real

**Evidencia:**
- `ARCHITECTURE.md` §2 dice que `AuthStore` vive en `features/auth/store/auth.store.ts`; en realidad vive en `src/app/core/auth/auth.store.ts`.
- §3 documenta tres interceptors (`auth-interceptor` con Bearer token, `error-interceptor`, `loading-interceptor`); los reales son `csrf-interceptor` y `unauthorized-redirect-interceptor`, y la autenticación es por cookie httpOnly, no por header (el modelo documentado ni siquiera aplica ya).
- §3 y §8 tienen notas "esto aún no existe, es wiring nuevo" sobre `provideHttpClient`/`provideTanStackQuery`, que ya existen en `app.config.ts` desde hace varias features.

**Impacto:** la documentación es el mayor activo del proyecto (ver Fortalezas); cada divergencia sin corregir devalúa el conjunto. Un desarrollador nuevo que siga §3 al pie de la letra implementará un modelo de auth equivocado.

**Recomendación:** un pase de sincronización de `ARCHITECTURE.md` contra el código (media jornada). Establecer como norma de PR: si el cambio contradice ARCHITECTURE.md, el PR actualiza ARCHITECTURE.md (misma regla que ya tiene la Constitución para sí misma).

#### H7. Duplicación estructural en `sqlite-partner-repository.ts` (529 líneas, el archivo más grande del repo)

**Evidencia:** `src/server/persistence/sqlite/sqlite-partner-repository.ts` — el patrón `this.db.exec('BEGIN') / try { ... COMMIT } catch { ROLLBACK; throw }` se repite **5 veces** (`createPartner`, `saveThemeVersion`, `publishThemeVersion`, `deactivatePartner`, `activatePartner`); `activatePartner` (:454-486) y `deactivatePartner` (:420-452) son idénticos salvo el string de status y la dirección del diff.

**Impacto:** cada método nuevo del repositorio copiará el boilerplate; un olvido de `ROLLBACK` en una copia futura es un bug de integridad. El archivo además mezcla dos responsabilidades (persistencia de partners/themes + escritura de auditoría), lo que lo hará crecer por dos motivos distintos.

**Recomendación:**
```ts
private withTransaction<T>(fn: () => T): T {
  this.db.exec('BEGIN');
  try { const r = fn(); this.db.exec('COMMIT'); return r; }
  catch (err) { this.db.exec('ROLLBACK'); throw err; }
}

private setPartnerStatus(partnerId: string, status: 'active' | 'inactive', actorName?: string) { ... }
```
Esto reduce ~120 líneas y elimina la clase de bug. La mezcla persistencia+auditoría es defendible (la atomicidad mutación+audit es un requisito de la spec 006) — mantenerla, pero documentarla como decisión en el doc-comment de la clase.

#### H8. SQLite síncrono (`DatabaseSync`) bloquea el event loop

**Evidencia:** `sqlite-partner-repository.ts:1,109-115` usa `node:sqlite` `DatabaseSync`; cada query bloquea el proceso Node que también sirve el SSR de Angular.

**Impacto:** **aceptable hoy** (queries indexadas de microsegundos, tráfico bajo, litestream ya contemplado para replicación). El riesgo es de crecimiento: si el catálogo de partners, la auditoría o el tráfico SSR crecen un orden de magnitud, las pausas se notarán en TTFB.

**Recomendación:** no migrar ahora — sería sobre-ingeniería. El seam correcto ya existe (`PartnerRepository` + contract test + `persistence-config.ts` con selección por driver, igual que `AssetStorage`). Dejar escrito el umbral de migración (p. ej. "si p95 de una query supera X ms o el catálogo supera N partners → adaptador Postgres/Turso pasa el mismo contract test"). Eso convierte una futura crisis en una tarea planificada.

### 🟢 Impacto bajo (oportunistas)

#### H9. Imports relativos profundos

**Evidencia:** `import ... from '../../../../../shared/partner/asset-slots'` (`asset-uploader.ts:5`) y similares por todo `src/app`.

**Recomendación:** path aliases en `tsconfig.json`: `@shared/*` → `src/shared/*`, `@core/*` → `src/app/core/*`, `@ui/*` → `src/app/shared/ui/*`. Baratísimo ahora, cada vez más caro después (cada archivo nuevo copia el patrón). Bonus: hace linteable la dirección de las dependencias (H1).

#### H10. Colores hardcodeados fuera del sistema de tokens en pantallas themeadas

**Evidencia:** `src/app/features/partner-shell/partner-shell.ts:19` — `border-[#cccccc] bg-white` en el header de la pantalla pública que se themea por partner. Todo lo demás de esa pantalla usa tokens (`bg-surface`, `text-text-strong`, `font-brand`).

**Impacto:** contradice el espíritu de la Constitución §16 (variación solo por tokens): si un partner futuro necesita header oscuro, habrá que tocar markup.

**Recomendación:** promover esos dos valores a tokens del theme (`colorHeaderSurface`, `colorHeaderBorder`) con default = valores actuales, siguiendo el patrón ya usado para `colorFooterSurface`.

#### H11. Higiene de tests

**Evidencia:**
- El helper `fixture.componentInstance as any` para acceder a miembros `protected` está copiado en 6+ specs (`partners-list.spec.ts`, `admin-layout.spec.ts`, `partner-create.spec.ts`, `color-field.spec.ts`, `brand-editor.spec.ts`…) — es el único `as any` del repo.
- Conviven dos runners sin documentación: Karma/Jasmine (`*.spec.ts`, DOM) y `node:test` (`*.test.ts`, servidor + lógica pura). La convención es sensata pero solo vive en `package.json`.
- No hay umbral de cobertura ni tests e2e del flujo crítico (login OIDC → panel → publicar theme → ver pantalla pública).

**Recomendación:** (a) un helper compartido de test tipado (`asProtected<T>(fixture)` con un tipo utilitario) en un `src/app/testing/`; (b) documentar la convención spec/test en `ARCHITECTURE.md` §9; (c) cuando exista CI (H1), fijar cobertura mínima en las carpetas críticas (`core/`, `server/security/`, `server/oidc/`) y considerar 2-3 e2e Playwright del happy path (el CLI ya está en el toolchain del proyecto).

#### H12. Higiene de raíz del repo y arranque

**Evidencia:**
- `README.md` es el generado por Angular CLI: no menciona `start:full`, `test:server`, las env vars, el BFF, ni enlaza `GLOSARIO.md`/`prds/`/`specs/`/`documentation/`.
- `partners.db`, `partners.db-shm`, `partners.db-wal` viven en la raíz del repo (ignorados por git, pero ruido) mientras los assets ya van a `./data/assets`.
- `app.config.ts:36-76` concentra 3 `provideAppInitializer` con lógica no trivial (siembra de theme, siembra de sesión, bootstrap whoami) definida inline — testeable solo vía integración.

**Recomendación:** README propio (30 líneas: qué es, cómo arrancar full-stack, dónde está la documentación real); mover la DB por defecto a `data/partners.db` (una línea en `persistence-config`); extraer los tres initializers a funciones nombradas en `core/` (`provideThemeSeed()`, `provideSessionSeed()`, `provideSessionBootstrap()`) — `app.config.ts` queda declarativo y cada pieza gana test unitario.

#### H13. Credenciales de desarrollo versionadas en el realm export de Keycloak

**Evidencia:** `infra/sso/realm/backoffice-realm.json:23,120-186` — client secret (`backoffice-bff-dev-secret`) y 8 usuarios con contraseña en texto plano.

**Impacto:** aceptable y práctico para el entorno local reproducible (es su propósito). El riesgo es de deriva: que ese realm/secret se importe tal cual en un entorno compartido.

**Recomendación:** banner explícito en `infra/sso/README.md`: "solo desarrollo local; en cualquier entorno compartido el realm se aprovisiona con secretos generados, nunca este archivo". Nombrar el secret de forma inequívoca ya ayuda (lo hace); considerar sufijo `-DO-NOT-DEPLOY`.

---

## 4. Hoja de ruta recomendada (orden de retorno económico)

| # | Acción | Esfuerzo | Retorno |
|---|--------|----------|---------|
| 1 | **ESLint (angular-eslint) + CI (lint, test, test:server, build)** — H1 | 1-2 días | Previene la regresión de todo lo demás; convierte la Constitución en algo verificable |
| 2 | **Validadores de DTO en la frontera del BFF**, eliminar `as never` — H2 | 1 día | Cierra la brecha de seguridad/robustez más real del sistema |
| 3 | **Resolver la contradicción Constitución §4** (mutations → `*Queries`) y sincronizar `ARCHITECTURE.md` — H3, H6 | 1 día | Restaura la autoridad del sistema normativo, que es el activo diferencial del proyecto |
| 4 | **`environment.production.ts` + `.env.example` + config server centralizada** — H4 | ½ día | Elimina el default localhost en prod; onboarding de entornos barato |
| 5 | **`withTransaction()` / `setPartnerStatus()` en el repo SQLite; JOIN en listado; decidir contrato de paginación/búsqueda** — H5, H7 | 1 día | -120 líneas, elimina una clase de bug de integridad y una bomba de tiempo de UX |
| 6 | **Oportunistas**: path aliases, tokens de header, helper de tests, README, initializers nombrados — H9-H12 | al hacer otros cambios | Reduce fricción diaria acumulada |

Total del núcleo (1-5): **~una semana** de trabajo para pasar de "disciplina por convención" a "disciplina por construcción".

## 5. Qué NO hacer (anti-recomendaciones)

Con ~6.800 líneas de código fuente, el peligro simétrico a la deuda es la sobre-ingeniería:

- **No** migrar a microservicios/monorepo Nx/módulos federados. El monolito SSR+BFF es la arquitectura correcta para este tamaño y equipo.
- **No** introducir un ORM (Prisma/Drizzle) ni migrar de SQLite hoy. El repositorio con contract test es un seam mejor que cualquier ORM; migrar de motor es una tarea acotada cuando (si) llegue el umbral (H8).
- **No** expandir NgRx a estado global de datos de servidor. La división SignalStore/TanStack Query actual es idiomática y está funcionando.
- **No** añadir librerías de componentes UI. `shared/ui/` con variantes por `input()` + tokens de theme es exactamente lo que un producto white-label necesita.
- **No** reescribir los 3 layers de guards ni el flujo OIDC: están testeados y alineados con las specs 006-008.

La estrategia ganadora aquí no es cambiar la arquitectura — es **blindar la que ya se eligió**.

---

*Auditoría generada a partir de lectura directa del código (estructura completa de `src/`, `server.ts`, routers del BFF, repositorio SQLite, stores, guards, interceptors, componentes del panel admin y de la shell pública, configuración de build y de infra) contrastada contra `CONSTITUTION.md` y `ARCHITECTURE.md`.*
