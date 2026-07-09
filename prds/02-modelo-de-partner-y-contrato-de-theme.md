# PRD 02 — Modelo de Partner y Contrato de Theme

> **Depende de:** [00 Visión](./00-vision-y-alcance.md),
> [01 Tenant/Routing](./01-resolucion-de-tenant-y-routing.md).
> **Habilita:** [03 Theming](./03-theming-dinamico-y-anti-fouc.md),
> [04 BFF](./04-arquitectura-bff.md),
> [05 Back Office](./05-back-office-gestion-de-partners.md),
> [06 AuthZ/Auditoría](./06-authz-roles-y-auditoria.md).

---

## 1. Objetivo

Definir el **modelo de datos canónico** de un partner y su branding, la
**persistencia** tras un **puerto de repositorio** (V1: SQLite embebida con
respaldo continuo a bucket vía Litestream single-node; el escalado se resuelve
cambiando el adaptador del puerto a Postgres — ver §5) + object storage/CDN para
binarios, el **versionado** para trazabilidad, y el **contrato JSON** que
consumen tanto el front (theming, PRD 03) como el Back Office (PRD 05). Este PRD
es la **única fuente de verdad de los contratos**; 03–06 los referencian, no los
redefinen.

> **Recordatorio de decisión 5 (PRD 00):** la multi-tenancy es **solo branding
> visual**. Este modelo **no** incluye composición modular de producto, reglas
> de negocio ni pasos del journey por partner.

---

## 2. Entidad `Partner`

Identidad y estado del banco distribuidor.

```typescript
interface Partner {
  id: string;              // UUID interno (nunca en la URL)
  slug: string;            // identificador de URL, kebab-case (ver PRD 01 §3)
  displayName: string;     // "Banco Popular"
  status: 'active' | 'inactive';  // desactivación lógica; nunca borrado físico
  themeId: string;         // FK a la versión de theme vigente (ver §4)
  createdAt: string;       // ISO-8601
  updatedAt: string;       // ISO-8601
  createdBy: string;       // sub del usuario (auditoría, PRD 06)
  updatedBy: string;
}
```

- **`slug`** es único e inmutable una vez creado (cambiarlo rompería links).
- **`status`**: la baja es **lógica** (`inactive`), nunca `DELETE` físico
  (requisito de trazabilidad, PRD 00). Un partner `inactive` cae al fallback
  (PRD 01 §5).

---

## 3. Entidad `PartnerTheme` (contrato canónico)

Todo el branding configurable de un partner. **Es un theme, no incluye lógica.**

```typescript
interface PartnerTheme {
  id: string;                 // UUID de esta versión de theme
  partnerId: string;
  version: number;            // incremental, para versionado/auditoría (§4)
  tokens: ThemeTokens;
  assets: ThemeAssets;
  legal: ThemeLegal;
  typography: ThemeTypography;
  publishedAt: string | null; // null = borrador; fecha = publicado
}

interface ThemeTokens {
  colorPrimary: string;        // hex, p.ej. "#00947F"
  colorPrimaryTint: string;    // p.ej. "#E0F4ED"
  colorSecondary: string;      // p.ej. "#105163"
  colorSecondaryTint: string;  // p.ej. "#CCD3DB"
  colorTextStrong: string;     // p.ej. "#000000"
  colorTextMuted: string;      // p.ej. "#666666"
  colorSurface: string;        // p.ej. "#FFFFFF"
  colorBorder: string;         // p.ej. "#EBEBEB"
  // paleta mínima; se amplía sin romper (campos opcionales aditivos)
}

interface ThemeAssets {
  logoUrl: string;             // logo del producto/aseguradora (header)
  faviconUrl: string;
  coBrandBankLogoUrl: string;  // logo del banco (footer co-branded)
  coBrandGroupLogoUrl?: string;// logo del grupo (p.ej. Grupo Aval), opcional
  ogImageUrl?: string;         // open graph / share, opcional
}

interface ThemeLegal {
  footerDisclaimer: string;    // p.ej. texto Superintendencia Financiera
  termsUrl?: string;
  privacyUrl?: string;
  // textos configurables por partner (decisión 5: textos/legales sí varían)
}

interface ThemeTypography {
  fontFamily: string;          // nombre de familia (self-hosted, ver PRD 03)
  fontUrlWoff2?: string;       // opcional: fuente custom por partner
}
```

### Contrato de respuesta del BFF (lo que llega al front)

El BFF (PRD 04) expone una **proyección pública** del theme del partner activo.
**Nunca** incluye `id` internos sensibles, credenciales ni endpoints de
integración:

```jsonc
// GET /api/theme/:slug  → 200
{
  "slug": "popular",
  "displayName": "Banco Popular",
  "version": 7,
  "tokens": {
    "colorPrimary": "#00947F",
    "colorPrimaryTint": "#E0F4ED",
    "colorSecondary": "#105163",
    "colorSecondaryTint": "#CCD3DB",
    "colorTextStrong": "#000000",
    "colorTextMuted": "#666666",
    "colorSurface": "#FFFFFF",
    "colorBorder": "#EBEBEB"
  },
  "assets": {
    "logoUrl": "https://cdn.../seguros-alfa/logo.svg",
    "faviconUrl": "https://cdn.../popular/favicon.ico",
    "coBrandBankLogoUrl": "https://cdn.../popular/banco-popular.svg",
    "coBrandGroupLogoUrl": "https://cdn.../grupo-aval.svg"
  },
  "legal": {
    "footerDisclaimer": "Vigilado por la Superintendencia Financiera de Colombia."
  },
  "typography": { "fontFamily": "Inter" }
}
```

> Los valores de `tokens` del ejemplo son los **tokens reales** extraídos del
> Figma de referencia (Seguros Alfa), para ilustrar el shape. Cada partner
> define los suyos en el Back Office.

---

## 4. Versionado y auditoría

- Cada guardado de theme crea una **nueva versión** (`PartnerTheme.version++`),
  no sobreescribe. `Partner.themeId` apunta a la versión **publicada** vigente.
- Estados: **borrador** (`publishedAt = null`) vs **publicado**. El front solo
  sirve versiones publicadas; el Back Office puede previsualizar borradores
  (PRD 05).
- El historial de versiones alimenta la **auditoría** (quién/qué/cuándo,
  PRD 06): cada versión guarda `createdBy` y timestamp.
- **Rollback**: publicar equivale a mover `themeId` a otra versión; revertir es
  re-publicar una versión anterior (no se pierde historial).

---

## 5. Persistencia (in-scope, decisión 4 del PRD 00)

### Base de datos V1 — **SQLite embebida**

Justificación: la configuración de partners es de **baja cardinalidad**
(decenas/cientos de partners), **lectura intensiva** (el theme se sirve en cada
request de la experiencia) y **escritura rara y solo-admin** (altas/ediciones
en el Back Office). Una **SQLite embebida** da latencia de lectura mínima (sin
salto de red hacia una DB central) y conserva **integridad** (unicidad de slug),
**versionado** y **auditoría** transaccional. La config vive en SQLite; los
binarios en object storage/CDN (ver abajo); los secretos en el secret manager
(PRD 04 §5) — nunca se mezclan.

El siguiente es el **esquema del adaptador SQLite** (el adaptador Postgres lo
espeja con `JSONB`, ver más abajo):

```
partners        (id, slug UNIQUE, display_name, status, theme_id, timestamps, actor cols)
partner_themes  (id, partner_id FK, version, tokens TEXT/JSON, assets TEXT/JSON,
                 legal TEXT/JSON, typography TEXT/JSON, published_at, created_by, created_at)
audit_log       (id, entity, entity_id, action, actor_sub, diff TEXT/JSON, at)  -- ver PRD 06
```

- `tokens/assets/legal/typography` se guardan como **JSON en columnas `TEXT`**;
  SQLite consulta con las funciones `json()` / `json_extract()` donde haga falta.
- Índices: `partners.slug` (único), `partner_themes(partner_id, version)`.
- **WAL mode** activado (requisito de Litestream single-node y de concurrencia
  lectura/escritura).

### Puerto de repositorio (hexagonal) + adaptadores

El acceso a datos se hace **exclusivamente** a través de un **puerto**
`PartnerRepository`; el dominio y los handlers del BFF dependen del puerto, no
del motor de BD (análogo a la regla de `ARCHITECTURE.md` §3: los componentes no
inyectan `HttpClient` directo). Esto hace que el escalado a Postgres sea un
**cambio mínimo** (escribir un adaptador nuevo), sin tocar dominio ni handlers.

```typescript
// puerto — el dominio/BFF depende solo de esto (nunca de SQL)
interface PartnerRepository {
  // lecturas (experiencia)
  findActiveSlugs(): Promise<string[]>;
  findBySlug(slug: string): Promise<Partner | null>;
  getPublishedTheme(slug: string): Promise<PartnerTheme | null>;
  // Back Office
  listPartners(query: PartnerQuery): Promise<Partner[]>;
  createPartner(input: NewPartner): Promise<Partner>;
  saveThemeVersion(partnerId: string, theme: NewThemeVersion): Promise<PartnerTheme>;
  publishThemeVersion(partnerId: string, themeId: string): Promise<void>;
  deactivatePartner(partnerId: string): Promise<void>;
}
```

Reglas del puerto:

- **SQL solo en el adaptador:** ningún handler del BFF ejecuta SQL directo; el
  dominio ve objetos tipados. El adaptador es dueño del **dialecto** y del
  **JSON** (SQLite: `TEXT` + `json_extract()`; Postgres: `JSONB`).
- **Auditoría transaccional (PRD 06):** cada mutación y su fila de `audit_log`
  se escriben en la **misma transacción** (transacción interna del adaptador).
  El `audit_log` no es un puerto aparte.
- **Selección por configuración:** `PERSISTENCE_DRIVER=sqlite|postgres` (leído
  del entorno, `ARCHITECTURE.md` §8) elige el adaptador en el wiring del
  servidor. Cambiar de motor = cambiar la variable + tener el adaptador.
- **Ubicación (server-side):** la capa vive en el runtime del BFF (Angular SSR
  Node), p. ej. `src/server/persistence/partner-repository.ts` (puerto) +
  `.../sqlite/sqlite-partner-repository.ts` y (futuro)
  `.../postgres/postgres-partner-repository.ts`, siguiendo el naming de
  `ARCHITECTURE.md` §1 (sin sufijo de tipo, kebab-case, separador `-`).
- **Contract-test compartido:** una batería de tests corre contra *cualquier*
  adaptador; el adaptador Postgres se acepta cuando pasa el **mismo
  contract-test** que el de SQLite (gate de la migración).

### Durabilidad V1 (instancia única) — **Litestream single-node**

La V1 corre en **una sola instancia**: esa instancia lee y escribe su SQLite
local, **sin primaria/réplica y sin enrutamiento de escrituras**. La durabilidad
ante reinicio/caída la da **Litestream en modo single-node**:

- **Respaldo continuo:** `litestream replicate` corre como proceso de fondo
  (sidecar) y sube los segmentos WAL de SQLite al **bucket** cada `sync-interval`
  (~segundos → RPO objetivo ~segundos). El bucket es la fuente de durabilidad,
  no el disco local (desechable).
- **Restore automático al arrancar:** al provisionar/reiniciar la instancia,
  `litestream restore` reconstruye el SQLite desde el bucket **antes** de servir
  tráfico → arranca con el estado publicado vigente.
- **Un solo nodo → sin coordinación:** no hay designación de primaria, ni
  `primary-svc`, ni promoción en failover. Es el caso de uso base de Litestream
  (backup + restore de un SQLite), no la topología primaria/réplica.
- **Verificación:** prueba de restauración periódica para validar la integridad
  del respaldo (PRD 07, RNF-Dur-1).

### Escalado a multi-instancia — **migración a Postgres (adaptador del puerto)**

Cuando se necesite **más de una instancia**, SQLite embebida deja de servir (un
archivo local por instancia no se comparte). El escalado se resuelve **migrando
a una BD cliente-servidor** (Postgres de referencia):

- Implementar `PostgresPartnerRepository` (mismo puerto, dialecto Postgres +
  `JSONB`) y cambiar `PERSISTENCE_DRIVER=postgres`.
- Cualquier instancia **lee y escribe** la BD central; **sin** replicación
  SQLite, **sin** primaria/réplica, **sin** enrutamiento de escrituras. Se
  **retira Litestream** (Postgres aporta su propio backup/HA).
- Migración de datos SQLite→Postgres por script (el JSON portable facilita el
  volcado). El costo está **acotado por el puerto**: dominio y handlers no
  cambian.

> Es un paso **futuro y bajo demanda**, gatillado por la necesidad real de
> multi-instancia — puede no ejecutarse si una instancia basta.

> Este bloque de escalado es **aditivo y separable** del modelo de datos: la
> validación funcional de este PRD y de 01–06 corre sobre **una sola instancia**
> (ver PRD 08, hito M1); la migración a Postgres (hito M2) se valida por separado
> (PRD 08 Fase 4).

### Assets (logos, favicons, fuentes) — **Object storage + CDN**

- Los binarios **no** van en la DB: se suben a **object storage** (S3 / GCS /
  Azure Blob) y se sirven vía **CDN**. La DB solo guarda **URLs**.
- El upload lo intermedia el **BFF** (PRD 04): el front nunca recibe
  credenciales del bucket (URLs firmadas de subida o proxy server-side).
- Validación de assets en el alta/edición (PRD 05): tipo MIME, tamaño máximo,
  dimensiones; sanitización de SVG.

---

## 6. Theme default (fallback)

Existe un **partner sintético `__default__`** (o config equivalente) con un
`PartnerTheme` neutro de plataforma, usado cuando la resolución cae en fallback
(PRD 01 §5). No es un banco real, no aparece en el listado del Back Office como
editable de forma estándar (o se marca como sistema).

---

## 7. Requisitos funcionales

- **RF-02.1** Un `Partner` tiene `slug` único e inmutable y `status`
  active/inactive (baja lógica).
- **RF-02.2** El branding vive en `PartnerTheme` **versionado**; cada cambio
  crea una versión nueva.
- **RF-02.3** El contrato público del BFF **excluye** IDs internos sensibles,
  credenciales y endpoints de integración.
- **RF-02.4** Los assets se guardan en object storage/CDN; la DB (SQLite) solo
  guarda URLs.
- **RF-02.5** El modelo es **aditivo/extensible**: agregar un token nuevo no
  rompe consumidores existentes (campos opcionales).
- **RF-02.6** Existe un theme default para el fallback.
- **RF-02.7** La durabilidad de la config se garantiza con **respaldo continuo
  de SQLite en el bucket** (Litestream **single-node**); la instancia se
  aprovisiona/reinicia restaurando desde el bucket antes de servir tráfico.
- **RF-02.8** V1: una **sola instancia** lee y escribe su SQLite local; **no hay
  enrutamiento de escrituras ni primaria/réplica**. El escalado a multi-instancia
  se hace **migrando a Postgres** vía el adaptador del puerto (RF-02.9).
- **RF-02.9** El acceso a datos se hace **solo** a través del puerto
  `PartnerRepository`; los adaptadores (SQLite, Postgres) son intercambiables por
  configuración (`PERSISTENCE_DRIVER`) sin tocar dominio ni handlers del BFF.

---

## 8. Criterios de aceptación

### M1 — instancia única (valida el modelo sin depender del escalado)

- [ ] Crear un partner persiste `Partner` + `PartnerTheme` v1 en borrador (SQLite).
- [ ] Publicar mueve `Partner.themeId` a la versión publicada; el front la sirve.
- [ ] Editar y publicar crea v2 sin destruir v1 (historial completo).
- [ ] `GET /api/theme/:slug` devuelve exactamente el shape del contrato público,
      sin campos sensibles.
- [ ] Subir un logo lo aloja en object storage y guarda solo la URL de CDN.
- [ ] Un partner `inactive` no es servible por el front (cae a fallback).
- [ ] Todo acceso a datos pasa por `PartnerRepository`; ningún handler del BFF
      ejecuta SQL directo.
- [ ] Restaurar la instancia desde el bucket (`litestream restore`, single-node)
      reproduce el estado publicado vigente tras un reinicio.

### M2 — escalado: migración a Postgres (se valida por separado)

- [ ] Existe un `PostgresPartnerRepository` que pasa el **mismo contract-test**
      que el adaptador SQLite.
- [ ] Cambiar `PERSISTENCE_DRIVER=postgres` levanta la app **sin cambios de
      código de dominio ni handlers**.
- [ ] El script de migración de datos SQLite→Postgres reproduce el estado
      publicado vigente.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| SVG malicioso subido como logo | Sanitización/validación server-side (PRD 04/05). |
| Divergencia de shape entre front y BFF | Contrato tipado compartido (TS types) como fuente única. |
| Crecimiento no controlado de versiones de theme | Retención/paginación de historial; versiones borrador limpiables. |
| URLs de assets rotas tras migración de bucket | URLs vía CDN estable; migración con redirección. |
| Cuello de botella de escritura (SQLite single-writer) | Escrituras raras y solo-admin; una sola instancia basta en V1. Al escalar, se migra a Postgres (§5). |
| Pérdida de datos al reiniciar/caer la instancia (V1) | Litestream single-node: respaldo continuo al bucket + `restore` al arrancar; RPO ~segundos. |
| Corrupción/pérdida del respaldo en el bucket | Respaldo continuo (WAL) + prueba de restauración periódica; verificación de integridad. |
| Migración SQLite→Postgres costosa/arriesgada | Puerto de repositorio + contract-tests compartidos + JSON portable; el adaptador queda aislado del dominio. |
