// Fuente única del esquema SQLite. Constante en TS (no archivo .sql leído en runtime)
// para que el esquema viaje embebido en cualquier bundle (SSR, node:test) sin depender
// de rutas relativas a `import.meta.url` que se rompen tras el bundling/minificado.
export const SCHEMA_SQL = `
-- WAL: requisito de Litestream single-node y de concurrencia lectura/escritura.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS partners (
  id           TEXT PRIMARY KEY,               -- UUID interno (nunca en URL)
  slug         TEXT NOT NULL UNIQUE,           -- único e inmutable (FR-002)
  partner_key  TEXT NOT NULL UNIQUE,           -- UUID de integración con servicios externos, único
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
  entity     TEXT NOT NULL CHECK (entity IN ('partner','partner_theme','access')),
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('create','save_version','update','publish','deactivate','activate','cross_partner_denied')),
  actor_sub  TEXT NOT NULL,                    -- quién, técnico (PRD 06)
  actor_name TEXT,                             -- quién, legible (FR-008) — nullable (filas previas)
  diff       TEXT,                             -- JSON opcional Record<field,{from,to}> (FR-008)
  theme_version INTEGER,                       -- versión resultante si aplica (FR-012) — nullable
  at         TEXT NOT NULL                     -- ISO-8601
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_slug        ON partners(slug);
CREATE        INDEX IF NOT EXISTS idx_themes_partner_ver    ON partner_themes(partner_id, version);
CREATE        INDEX IF NOT EXISTS idx_audit_entity          ON audit_log(entity, entity_id);
CREATE        INDEX IF NOT EXISTS idx_audit_actor           ON audit_log(actor_sub);
CREATE        INDEX IF NOT EXISTS idx_audit_at              ON audit_log(at);
`;

/** Superset mínimo de `DatabaseSync` que necesitan las migraciones (exec + introspección). */
interface MigratableDb {
  exec(sql: string): void;
  prepare(sql: string): { get(...params: unknown[]): unknown };
}

/**
 * Cuerpo del `CREATE TABLE audit_log` vigente (columnas + CHECK), reutilizado
 * tanto por el rebuild como como fuente de verdad del vocabulario permitido.
 * Debe mantenerse sincronizado con `SCHEMA_SQL`.
 */
const AUDIT_LOG_TABLE_BODY = `(
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL CHECK (entity IN ('partner','partner_theme','access')),
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('create','save_version','update','publish','deactivate','activate','cross_partner_denied')),
  actor_sub  TEXT NOT NULL,
  actor_name TEXT,
  diff       TEXT,
  theme_version INTEGER,
  at         TEXT NOT NULL
)`;

/**
 * Reconstruye `audit_log` con el `CHECK` vigente cuando la base fue creada
 * antes de 007 (el `CHECK` antiguo no admite `entity:'access'` /
 * `action:'cross_partner_denied'`, así que auditar un cruce lanzaría). SQLite
 * no permite ALTERar un `CHECK`; hay que rehacer la tabla. Idempotente y
 * auto-correctivo: si el `CHECK` ya está al día no hace nada (no requiere
 * `user_version` previo en bases legadas). Conserva `save_version` en el nuevo
 * `CHECK` para no perder filas históricas.
 */
function rebuildAuditLogIfStale(db: MigratableDb): void {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='audit_log'`)
    .get() as { sql: string } | undefined;

  if (!row || row.sql.includes('cross_partner_denied')) {
    // Sin tabla (base nueva: SCHEMA_SQL ya la creó bien) o ya migrada.
    return;
  }

  // Receta estándar de rebuild de SQLite: foreign_keys OFF fuera de la
  // transacción (audit_log no tiene FKs, pero seguimos la receta canónica).
  db.exec('PRAGMA foreign_keys=OFF;');
  db.exec('BEGIN;');
  try {
    db.exec(`CREATE TABLE audit_log_new ${AUDIT_LOG_TABLE_BODY};`);
    db.exec(
      `INSERT INTO audit_log_new (id, entity, entity_id, action, actor_sub, actor_name, diff, theme_version, at)
       SELECT id, entity, entity_id, action, actor_sub, actor_name, diff, theme_version, at FROM audit_log;`,
    );
    db.exec('DROP TABLE audit_log;');
    db.exec('ALTER TABLE audit_log_new RENAME TO audit_log;');
    // Los índices se fueron con el DROP: recrearlos.
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_sub);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log(at);`);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys=ON;');
  }
}

/**
 * Guardas aditivas para bases ya creadas antes de esta feature (`audit_log`
 * sin `actor_name`/`theme_version`, o con el `CHECK` antiguo). Tolerantes a
 * "duplicate column" — no requieren migración destructiva (D8, data-model §7).
 */
export function applySchemaMigrations(db: MigratableDb): void {
  const columns: Array<[string, string]> = [
    ['actor_name', 'TEXT'],
    ['theme_version', 'INTEGER'],
  ];
  for (const [column, type] of columns) {
    try {
      db.exec(`ALTER TABLE audit_log ADD COLUMN ${column} ${type};`);
    } catch (err) {
      if (!(err instanceof Error) || !/duplicate column/i.test(err.message)) {
        throw err;
      }
    }
  }

  // partner_key (integración con servicios externos): columna + backfill + índice
  // UNIQUE para bases creadas antes de esta feature. Se agrega nullable porque
  // SQLite no admite ADD COLUMN NOT NULL sin default en tabla poblada; las filas
  // legadas se rellenan con su `id` (UUID único ⇒ no rompe el índice UNIQUE) y la
  // obligatoriedad se garantiza a nivel de aplicación (validación del alta).
  try {
    db.exec('ALTER TABLE partners ADD COLUMN partner_key TEXT;');
  } catch (err) {
    if (!(err instanceof Error) || !/duplicate column/i.test(err.message)) {
      throw err;
    }
  }
  db.exec(`UPDATE partners SET partner_key = id WHERE partner_key IS NULL OR partner_key = '';`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_partner_key ON partners(partner_key);');

  // Tras asegurar las columnas nuevas, reconstruir el CHECK obsoleto (007).
  rebuildAuditLogIfStale(db);
}
