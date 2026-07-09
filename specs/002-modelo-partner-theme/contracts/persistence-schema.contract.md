# Contract — Esquema de persistencia (SQLite V1 + espejo Postgres)

Esquema **propiedad del adaptador** (FR-020): ningún consumidor conoce estas
tablas. Se documenta como contrato para que el adaptador Postgres (M2) lo espeje.
DDL SQLite en `src/server/persistence/sqlite/schema.sql`.

## DDL — adaptador SQLite (V1)

```sql
-- WAL: requisito de Litestream single-node y de concurrencia lectura/escritura.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS partners (
  id           TEXT PRIMARY KEY,               -- UUID interno (nunca en URL)
  slug         TEXT NOT NULL UNIQUE,           -- único e inmutable (FR-002)
  display_name TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('active','inactive')),  -- baja lógica (FR-003)
  theme_id     TEXT REFERENCES partner_themes(id),  -- versión publicada vigente (FR-012); nullable
  created_at   TEXT NOT NULL,                  -- ISO-8601
  updated_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL,                  -- auditoría (FR-001)
  updated_by   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partner_themes (
  id           TEXT PRIMARY KEY,               -- UUID de ESTA versión
  partner_id   TEXT NOT NULL REFERENCES partners(id),
  version      INTEGER NOT NULL,               -- incremental por partner (FR-010)
  tokens       TEXT NOT NULL,                  -- JSON (aditivo, FR-006)
  assets       TEXT NOT NULL,                  -- JSON (solo URLs, FR-015)
  legal        TEXT NOT NULL,                  -- JSON
  typography   TEXT NOT NULL,                  -- JSON
  published_at TEXT,                           -- NULL = borrador; fecha = publicado (FR-011)
  created_by   TEXT NOT NULL,                  -- quién (FR-014)
  created_at   TEXT NOT NULL,                  -- cuándo (FR-014)
  UNIQUE (partner_id, version)                 -- no sobrescribe; incrementa (FR-010)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL CHECK (entity IN ('partner','partner_theme')),
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL,                    -- create|save_version|publish|deactivate
  actor_sub  TEXT NOT NULL,                    -- quién (PRD 06)
  diff       TEXT,                             -- JSON opcional (formato final PRD 06)
  at         TEXT NOT NULL                     -- ISO-8601
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_slug        ON partners(slug);
CREATE        INDEX IF NOT EXISTS idx_themes_partner_ver    ON partner_themes(partner_id, version);
CREATE        INDEX IF NOT EXISTS idx_audit_entity          ON audit_log(entity, entity_id);
```

## Reglas de mapeo JSON ⇄ tipos

- `tokens/assets/legal/typography` se **serializan con `JSON.stringify`** al
  escribir y se **parsean con `JSON.parse`** al leer, dentro del adaptador. El
  dominio nunca ve el string JSON. La **aditividad** (FR-006) es gratis: un token
  opcional nuevo entra en el blob sin `ALTER TABLE`.
- Timestamps ISO-8601 como `TEXT`. UUIDs como `TEXT` (`crypto.randomUUID()`).

## Atomicidad (FR-022) — patrón transaccional del adaptador

Cada método de mutación envuelve **mutación + `audit_log`** en una transacción:

```
BEGIN;
  <INSERT/UPDATE de la entidad>;
  INSERT INTO audit_log(...);          -- misma transacción
COMMIT;   -- rollback automático ante cualquier fallo (todo-o-nada)
```

`createPartner` inserta `partners` + `partner_themes` (v1 borrador) + `audit_log`
en **una** transacción (US1 alta atómica).

## Espejo Postgres (M2 — fuera de esta feature, documentado para el contract-test)

- `TEXT` JSON → **`JSONB`**; `json_extract()` → operadores `->>`/`jsonb_path`.
- `UNIQUE`/FK/índices equivalentes. Transacciones equivalentes.
- Sin Litestream (Postgres aporta su propio backup/HA). Migración de datos por
  script (el JSON portable facilita el volcado).
- **Gate**: el `PostgresPartnerRepository` se acepta cuando pasa la **misma**
  batería `repository-contract-tests.md` (SC-009).

## Durabilidad (Litestream single-node) — configuración de despliegue

No es DDL ni código del repo; es operación. Referencia (detalle en `quickstart.md`):

```yaml
# litestream.yml (sidecar)
dbs:
  - path: /data/partners.db
    replicas:
      - url: s3://<bucket>/partners
        sync-interval: 1s        # RPO objetivo ~segundos (FR-023, SC-008)
```
- Arranque: `litestream restore -if-replica-exists /data/partners.db` **antes** de
  servir tráfico → estado publicado vigente disponible tras reinicio (US Edge Case,
  SC-008).
- Ejecución: `litestream replicate` como sidecar durante toda la vida del proceso.
