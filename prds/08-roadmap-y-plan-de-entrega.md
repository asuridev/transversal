# PRD 08 — Roadmap y Plan de Entrega

> **Depende de:** todos los PRDs anteriores
> ([00](./00-vision-y-alcance.md)–[07](./07-requisitos-no-funcionales-y-observabilidad.md)).
> **Habilita:** el arranque de implementación (plataforma 01–07 **y** la serie de
> páginas del journey `09+`).

---

## 1. Objetivo

Secuenciar la construcción en **fases** con un **MVP** claro, explicitar el
**grafo de dependencias** entre PRDs, definir los criterios de "listo para
construir" y "listo para producción", y proponer un **backlog inicial de
épicas** derivado de cada PRD. Incluye la secuenciación de la **serie de páginas
del journey (`09+`)**, que se construye sobre la infraestructura de la Fase 1.

---

## 2. Grafo de dependencias

```
00 Visión
   │
   ├─► 01 Tenant/Routing ─────────────┐
   │                                  ▼
   ├─► 02 Modelo/Theme ──► 03 Theming ──► 05 Back Office ──► 06 AuthZ/Auditoría
   │        │                             ▲
   │        └──► 04 BFF ──────────────────┘
   │
   └─► 07 No-funcionales (transversal, aplica a 01–06 y a 09+)

  Serie de páginas del journey (cuelga de la infra de Fase 1):
     01 Tenant/Routing ─┐
     03 Theming ────────┼─► 09+ Páginas del journey (09 KYC → 10 Datos → 11 Salud → …)
     04 BFF ────────────┘
```

**Camino crítico:** `02 → 04 → 03 → 05`. El BFF (04) y el contrato (02)
desbloquean tanto el theming (03) como el Back Office (05).

**Serie de páginas del journey (`09+`):** su **dependencia dura** es la infra de
la **Fase 1** (routing 01, theming 03, BFF/proxy de journey 04); **no** depende de
05/06/07 ni de "concluir" el PRD 08. Se **programa después** del Back Office y la
AuthZ (Fase 5) por priorización, no por bloqueo técnico.

### Entrega progresiva y validación independiente

Cada PRD se **construye y valida de forma independiente** mockeando su
dependencia aguas abajo. Ningún criterio de aceptación funcional de 01–06
depende del **escalado a Postgres (M2)**: todos corren sobre **una sola instancia
con SQLite local (V1/M1)**.

| PRD | Se valida solo mockeando… | Hito |
|-----|---------------------------|------|
| 01 Resolver | lista de partners activos (función pura, tests unitarios) | — (independiente) |
| 02 Modelo | — (persistencia real, 1 instancia) | **M1** |
| 03 Theming | JSON de theme público (SSR + fallback) | — (mock del BFF) |
| 04 BFF | secret manager + Mashery (mocks) sobre SQLite local (vía puerto de repositorio) | **M1** |
| 05 Back Office | `/api/admin/*` (mock) | **M1** |
| 06 AuthZ | IdP (stub de sesión dev) | **M1** |
| 07 No-func | — (transversal; incluye la validación de M2) | **M1 + M2** |
| Escalado (Postgres) | — (contract-test del adaptador + migración de datos) | **M2** |
| 09+ Páginas journey | proxy de journey del BFF (`POST /api/journey/:slug/*`, mock) | — (tras Fase 1) |

---

## 3. Fases

### Fase 0 — Fundaciones (habilitadores)

- Wiring nuevo de `app.config.ts`: `provideHttpClient(withInterceptors(...))`,
  `provideTanStackQuery(new QueryClient())`, SSR (`ARCHITECTURE.md` §3/§8).
- Estructura feature-first base (`core/`, `shared/`, `features/`).
- **SQLite de instancia única (hito M1)** + **puerto `PartnerRepository` +
  adaptador SQLite** + object storage/CDN aprovisionados (PRD 02).
  Postgres/multi-instancia **no** es prerrequisito de Fase 0.
- Secret manager integrado (PRD 04).
- **Entrega:** esqueleto que compila, SSR activo, SQLite y secretos conectados.

### Fase 1 — MVP multi-tenant (experiencia re-brandeable)

Objetivo: **un partner real re-brandeado end-to-end, sin FOUC**.
- PRD 01: resolver de tenant + routing + fallback.
- PRD 02: modelo `Partner`/`PartnerTheme` + persistencia + theme default.
- PRD 04: BFF `GET /api/theme/:slug` + `/api/partners/active` + caché +
  secretos.
- PRD 03: theming dinámico + SSR anti-FOUC + caché.
- **Entrega / Demo:** `app.com/popular/oferta` pinta con la marca de Banco
  Popular en el primer paint; `app.com/no-existe` cae a theme default.
- **Salida medible:** FOUC 0, 0 secretos en bundle, tests de resolver + BFF.

> La pantalla **"Ofrecimiento"** usada aquí como lienzo de preview es una
> **página del journey**; su especificación completa (campos, estados,
> validaciones) vive en la **serie `09+`** y se construye en la **Fase 5**.

### Fase 2 — Back Office

- PRD 05: CRUD de partners, editor de marca, **preview en vivo**, listado +
  buscador, publicación con invalidación de caché.
- PRD 04: endpoints `/api/admin/*` + intermediación de uploads.
- **Entrega:** un admin da de alta y configura un banco nuevo **sin deploy**.

### Fase 3 — Seguridad, roles y auditoría

- PRD 06: SSO OIDC/SAML mediado por BFF, roles, guards, auditoría inmutable.
- **Entrega:** Back Office protegido por SSO corporativo; todo cambio auditado.

### Fase 4 — Endurecimiento (no funcionales)

- PRD 07: CSP/headers, rate limiting, presupuestos de performance en CI,
  observabilidad (correlación por `partnerSlug`, dashboards), cobertura de
  tests.
- **Durabilidad V1 (single-node):** Litestream single-node backup + prueba de
  `restore` desde el bucket + monitoreo de la antigüedad del respaldo (PRD 02 §5,
  PRD 07). Concern **operativo, sin cambio de código de app**.
- **Escalado a Postgres (hito M2) — futuro/bajo demanda:** gatillado por la
  necesidad real de multi-instancia. Implementar `PostgresPartnerRepository`,
  migrar datos y hacer swap de driver (`PERSISTENCE_DRIVER=postgres`); habilitado
  por el puerto con cambio mínimo (PRD 02 §5). **Puede no ejecutarse** si una
  sola instancia basta; se valida de forma **independiente** (contract-test +
  migración).
- **Entrega:** listo para producción según criterios del PRD 07 §8, con la V1 de
  instancia única respaldada en bucket y el puerto listo para el escalado.

### Fase 5 — Páginas del journey (serie 09+)

Objetivo: **construir la experiencia de venta página a página** sobre la infra de
la Fase 1, re-brandeada por partner.

- **Regla de la serie:** una página = un PRD, con sus **validaciones
  individuales** (ver [PRD 09](./09-page-conoce-a-tu-cliente.md) como plantilla).
- **Orden secuencial por flujo:** `09 Conoce a tu cliente (KYC) → 10 Datos del
  cliente → 11 Declaración de salud → 12 Ofrecimiento del seguro → …` — la página
  N+1 se aborda tras integrar la N, en el orden real del journey.
- **Dependencia dura:** infra de **Fase 1** (01 routing, 03 theming, 04 BFF/proxy
  de journey). **No** depende de Back Office (05), AuthZ (06) ni de "concluir" el
  PRD 08; se **agenda tras** las Fases 2–3 por priorización (Back Office primero).
- **Transversalidad:** el endurecimiento (Fase 4 / PRD 07) aplica también a estas
  páginas conforme se construyen (CSP, performance, observabilidad, tests).
- **Validación:** cada página se acepta contra sus **criterios individuales**
  (p. ej. PRD 09 §9) mockeando el proxy de journey del BFF.
- **Entrega:** journey de venta operable **end-to-end por el asesor**, idéntico
  para todos los partners y solo re-brandeado (decisión 5, PRD 00).

---

## 4. Criterios de "listo para construir" (por PRD)

- [ ] **01** Lista de slugs reservados acordada; comportamiento de fallback
      elegido (landing neutra vs redirect).
- [ ] **02** SQLite de instancia única (M1), puerto `PartnerRepository` +
      adaptador SQLite y object storage/CDN confirmados; shape de contrato
      congelado. Para durabilidad V1: bucket + Litestream single-node
      aprovisionados (gate del bloque de endurecimiento, PRD 07). Para el
      escalado (M2): motor Postgres definido.
- [ ] **03** Estrategia SSR + `TransferState` validada en un spike.
- [ ] **04** Secret manager elegido; mapa `partnerSlug → credenciales`
      definido con el equipo de integración/Mashery.
- [ ] **05** Pantalla del journey elegida como lienzo de preview
      ("Ofrecimiento"); átomos `ui/` disponibles.
- [ ] **06** IdP corporativo y claims de rol confirmados con seguridad.
- [ ] **07** Presupuestos de performance y umbrales de alerta acordados.
- [ ] **09 (y serie 09+)** Infra de Fase 1 disponible (01/03/04); Figma de la
      página + copys legales confirmados; contrato del proxy de journey por
      partner definido con integración/Mashery.

---

## 5. Backlog inicial de épicas

| Épica | PRD | Descripción |
|-------|-----|-------------|
| E1 Fundaciones de app | 00/07 | Wiring SSR, HttpClient, TanStack Query, estructura. |
| E2 Resolver de tenant | 01 | `resolveTenant`, guard, routing, fallback + tests. |
| E3a Dominio de partner | 02 | Entidades, migraciones SQLite (M1), puerto `PartnerRepository` + adaptador SQLite, object storage, theme default. |
| E3b Durabilidad V1 | 02/07 | Litestream single-node backup + restore desde bucket + monitoreo de antigüedad del respaldo. |
| E3c Escalado a Postgres (futuro/on-demand) | 02/07 | Adaptador `PostgresPartnerRepository`, contract-test, migración de datos, swap de driver (M2). |
| E4 BFF theming | 04/03 | `/api/theme/:slug`, caché, SSR inject, `ThemeStore`. |
| E5 BFF secretos | 04 | Secret manager, mapa por partner, orquestación Mashery. |
| E6 Back Office CRUD | 05 | Listado, alta, edición, desactivación. |
| E7 Editor + preview | 05/03 | `brand-editor`, `theme-preview`, validación contraste. |
| E8 SSO + roles | 06 | OIDC/SAML por BFF, guards, roles. |
| E9 Auditoría | 06/02 | `audit_log`, consulta, ligado a versionado. |
| E10 Endurecimiento | 07 | CSP, rate limit, observabilidad, presupuestos CI. |
| E11 Páginas del journey | 09+ | Serie secuencial por flujo, empezando por KYC (09); cada página = un PRD con sus validaciones individuales. |

---

## 6. Definición de "listo para producción" (global)

Se cumplen los criterios de aceptación de todos los PRDs y, en particular, las
métricas de éxito del PRD 00 §8:

- [ ] Time-to-onboard de un partner < 1 día, sin deploy.
- [ ] FOUC = 0 en primera carga temática.
- [ ] 0 secretos expuestos al cliente (bundle + network verificados).
- [ ] ≥ 90% cobertura en resolver de tenant y BFF.
- [ ] 100% de cambios de partner auditados (quién/qué/cuándo).

---

## 7. Riesgos de programa y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Dependencia de Mashery de seguros no lista | Mockear Mashery detrás del BFF hasta contrato estable. |
| IdP corporativo con lead time largo | Adelantar Fases 1–2 (no bloqueantes); stub de sesión en dev. |
| Alcance creep hacia config modular por partner | Decisión 5 (PRD 00) fija: multi-tenancy = solo branding. |
| Assets/branding sin governance | Auditoría + validación de contraste desde Fase 2/3. |
| Acoplar el escalado a Postgres (M2) al modelo (M1) bloquearía la validación independiente | El puerto de repositorio aísla el motor; M2 se verifica por separado (contract-test + migración) en Fase 4. |
