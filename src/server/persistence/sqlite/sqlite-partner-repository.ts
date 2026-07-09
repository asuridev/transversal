import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import type { Partner, NewPartner, PartnerQuery } from '../../../shared/partner/partner-model.ts';
import type { AuditQuery } from '../partner-repository.ts';
import type {
  PartnerTheme,
  NewThemeVersion,
  ThemeTokens,
  ThemeAssets,
  ThemeLegal,
  ThemeTypography,
} from '../../../shared/partner/partner-theme-model.ts';
import type { PartnerRepository } from '../partner-repository.ts';
import { RepositoryErrorException } from '../partner-repository.ts';
import { createAuditEntry, normalizeAuditAction } from '../audit.ts';
import type { AuditDiff, AuditEntry } from '../audit.ts';
import { SCHEMA_SQL, applySchemaMigrations } from './schema.ts';

interface PartnerRow {
  id: string;
  slug: string;
  partner_key: string;
  display_name: string;
  status: string;
  theme_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

interface PartnerThemeRow {
  id: string;
  partner_id: string;
  version: number;
  tokens: string;
  assets: string;
  legal: string;
  typography: string;
  published_at: string | null;
  created_by: string;
  created_at: string;
}

function rowToPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    slug: row.slug,
    partnerKey: row.partner_key,
    displayName: row.display_name,
    status: row.status as Partner['status'],
    themeId: row.theme_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

interface AuditRow {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  actor_sub: string;
  actor_name: string | null;
  diff: string | null;
  theme_version: number | null;
  at: string;
}

function rowToAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    entity: row.entity as AuditEntry['entity'],
    entityId: row.entity_id,
    action: normalizeAuditAction(row.action as AuditEntry['action']),
    actorSub: row.actor_sub,
    actorName: row.actor_name ?? row.actor_sub,
    diff: row.diff ?? undefined,
    themeVersion: row.theme_version ?? undefined,
    at: row.at,
  };
}

function diffOf(diff: AuditDiff): string {
  return JSON.stringify(diff);
}

function rowToTheme(row: PartnerThemeRow): PartnerTheme {
  return {
    id: row.id,
    partnerId: row.partner_id,
    version: row.version,
    tokens: JSON.parse(row.tokens) as ThemeTokens,
    assets: JSON.parse(row.assets) as ThemeAssets,
    legal: JSON.parse(row.legal) as ThemeLegal,
    typography: JSON.parse(row.typography) as ThemeTypography,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function isUniqueConstraintError(err: unknown, column: string): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed') && err.message.includes(column);
}

export class SqlitePartnerRepository implements PartnerRepository {
  private readonly db: DatabaseSync;

  constructor(location: string) {
    this.db = new DatabaseSync(location);
    this.db.exec(SCHEMA_SQL);
    applySchemaMigrations(this.db);
  }

  private insertAuditEntry(entry: Parameters<typeof createAuditEntry>[0]): AuditEntry {
    const full = createAuditEntry(entry);
    this.db
      .prepare(
        `INSERT INTO audit_log (id, entity, entity_id, action, actor_sub, actor_name, diff, theme_version, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        full.id,
        full.entity,
        full.entityId,
        full.action,
        full.actorSub,
        full.actorName,
        full.diff ?? null,
        full.themeVersion ?? null,
        full.at,
      );
    return full;
  }

  async findActiveSlugs(): Promise<string[]> {
    const rows = this.db
      .prepare(`SELECT slug FROM partners WHERE status = 'active'`)
      .all() as unknown as Array<{ slug: string }>;
    return rows.map((row) => row.slug);
  }

  async findBySlug(slug: string): Promise<Partner | null> {
    const row = this.db
      .prepare('SELECT * FROM partners WHERE slug = ?')
      .get(slug) as unknown as PartnerRow | undefined;
    return row ? rowToPartner(row) : null;
  }

  async findById(id: string): Promise<Partner | null> {
    const row = this.db
      .prepare('SELECT * FROM partners WHERE id = ?')
      .get(id) as unknown as PartnerRow | undefined;
    return row ? rowToPartner(row) : null;
  }

  async getThemeById(themeId: string): Promise<PartnerTheme | null> {
    const row = this.db
      .prepare('SELECT * FROM partner_themes WHERE id = ?')
      .get(themeId) as unknown as PartnerThemeRow | undefined;
    return row ? rowToTheme(row) : null;
  }

  async getLatestDraftTheme(partnerId: string): Promise<PartnerTheme | null> {
    // Un borrador "pendiente" solo existe si la ÚLTIMA versión está sin publicar.
    // Una versión sin publicar con `version` menor que otra ya publicada es un
    // borrador abandonado (superado por una publicación posterior) y NO debe
    // devolverse — si no, el editor se quedaría mostrando ese huérfano en vez del
    // estado publicado vigente.
    const row = this.db
      .prepare(
        `SELECT * FROM partner_themes
          WHERE partner_id = ? AND published_at IS NULL
            AND version = (SELECT MAX(version) FROM partner_themes WHERE partner_id = ?)
          LIMIT 1`,
      )
      .get(partnerId, partnerId) as unknown as PartnerThemeRow | undefined;
    return row ? rowToTheme(row) : null;
  }

  async getPublishedTheme(slug: string): Promise<PartnerTheme | null> {
    const row = this.db
      .prepare(
        `SELECT pt.*
           FROM partners p
           JOIN partner_themes pt ON pt.id = p.theme_id
          WHERE p.slug = ? AND p.status = 'active' AND p.theme_id IS NOT NULL`,
      )
      .get(slug) as unknown as PartnerThemeRow | undefined;
    return row ? rowToTheme(row) : null;
  }

  async listPartners(query: PartnerQuery): Promise<Partner[]> {
    const conditions: string[] = ["slug <> '__default__'"];
    const params: Array<string | number> = [];

    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM partners WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as PartnerRow[];

    return rows.map(rowToPartner);
  }

  async createPartner(
    input: NewPartner,
    firstTheme: NewThemeVersion,
    actorName?: string,
  ): Promise<{ partner: Partner; theme: PartnerTheme }> {
    const now = new Date().toISOString();
    const partnerId = randomUUID();
    const themeId = randomUUID();

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO partners
             (id, slug, partner_key, display_name, status, theme_id, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?)`,
        )
        .run(partnerId, input.slug, input.partnerKey, input.displayName, now, now, input.createdBy, input.createdBy);

      this.db
        .prepare(
          `INSERT INTO partner_themes
             (id, partner_id, version, tokens, assets, legal, typography, published_at, created_by, created_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          themeId,
          partnerId,
          JSON.stringify(firstTheme.tokens),
          JSON.stringify(firstTheme.assets),
          JSON.stringify(firstTheme.legal),
          JSON.stringify(firstTheme.typography),
          firstTheme.createdBy,
          now,
        );

      this.insertAuditEntry({
        entity: 'partner',
        entityId: partnerId,
        action: 'create',
        actorSub: input.createdBy,
        actorName: actorName ?? input.createdBy,
        diff: diffOf({
          slug: { from: null, to: input.slug },
          partnerKey: { from: null, to: input.partnerKey },
          displayName: { from: null, to: input.displayName },
        }),
        at: now,
      });

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      if (isUniqueConstraintError(err, 'partners.slug')) {
        throw new RepositoryErrorException({ kind: 'UniqueSlug', slug: input.slug });
      }
      if (isUniqueConstraintError(err, 'partners.partner_key')) {
        throw new RepositoryErrorException({ kind: 'UniquePartnerKey', partnerKey: input.partnerKey });
      }
      throw err;
    }

    return {
      partner: {
        id: partnerId,
        slug: input.slug,
        partnerKey: input.partnerKey,
        displayName: input.displayName,
        status: 'active',
        themeId: null,
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
      theme: {
        id: themeId,
        partnerId,
        version: 1,
        tokens: firstTheme.tokens,
        assets: firstTheme.assets,
        legal: firstTheme.legal,
        typography: firstTheme.typography,
        publishedAt: null,
        createdBy: firstTheme.createdBy,
        createdAt: now,
      },
    };
  }

  async saveThemeVersion(partnerId: string, theme: NewThemeVersion, actorName?: string): Promise<PartnerTheme> {
    const now = new Date().toISOString();
    const themeId = randomUUID();

    this.db.exec('BEGIN');
    try {
      const previousRow = this.db
        .prepare('SELECT * FROM partner_themes WHERE partner_id = ? ORDER BY version DESC LIMIT 1')
        .get(partnerId) as unknown as PartnerThemeRow | undefined;
      const nextVersion = (previousRow?.version ?? 0) + 1;

      this.db
        .prepare(
          `INSERT INTO partner_themes
             (id, partner_id, version, tokens, assets, legal, typography, published_at, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          themeId,
          partnerId,
          nextVersion,
          JSON.stringify(theme.tokens),
          JSON.stringify(theme.assets),
          JSON.stringify(theme.legal),
          JSON.stringify(theme.typography),
          theme.createdBy,
          now,
        );

      const diff: AuditDiff = {};
      if (previousRow?.tokens !== JSON.stringify(theme.tokens)) {
        diff['tokens'] = { from: previousRow?.tokens ?? null, to: theme.tokens };
      }
      if (previousRow?.assets !== JSON.stringify(theme.assets)) {
        diff['assets'] = { from: previousRow?.assets ?? null, to: theme.assets };
      }
      if (previousRow?.legal !== JSON.stringify(theme.legal)) {
        diff['legal'] = { from: previousRow?.legal ?? null, to: theme.legal };
      }
      if (previousRow?.typography !== JSON.stringify(theme.typography)) {
        diff['typography'] = { from: previousRow?.typography ?? null, to: theme.typography };
      }

      this.insertAuditEntry({
        entity: 'partner_theme',
        entityId: themeId,
        action: 'update',
        actorSub: theme.createdBy,
        actorName: actorName ?? theme.createdBy,
        themeVersion: nextVersion,
        diff: diffOf(diff),
        at: now,
      });

      this.db.exec('COMMIT');

      return {
        id: themeId,
        partnerId,
        version: nextVersion,
        tokens: theme.tokens,
        assets: theme.assets,
        legal: theme.legal,
        typography: theme.typography,
        publishedAt: null,
        createdBy: theme.createdBy,
        createdAt: now,
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async publishThemeVersion(partnerId: string, themeId: string, actorName?: string): Promise<void> {
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      const themeRow = this.db
        .prepare('SELECT * FROM partner_themes WHERE id = ?')
        .get(themeId) as PartnerThemeRow | undefined;

      if (!themeRow) {
        throw new RepositoryErrorException({ kind: 'NotFound', entity: 'partner_theme', id: themeId });
      }
      if (themeRow.partner_id !== partnerId) {
        throw new RepositoryErrorException({
          kind: 'Conflict',
          message: `theme ${themeId} does not belong to partner ${partnerId}`,
        });
      }

      this.db
        .prepare('UPDATE partner_themes SET published_at = ? WHERE id = ?')
        .run(now, themeId);

      this.db
        .prepare('UPDATE partners SET theme_id = ?, updated_at = ? WHERE id = ?')
        .run(themeId, now, partnerId);

      this.insertAuditEntry({
        entity: 'partner',
        entityId: partnerId,
        action: 'publish',
        actorSub: themeRow.created_by,
        actorName: actorName ?? themeRow.created_by,
        themeVersion: themeRow.version,
        diff: diffOf({ status: { from: 'draft', to: 'published' } }),
        at: now,
      });

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async deactivatePartner(partnerId: string, actorName?: string): Promise<void> {
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      const partnerRow = this.db
        .prepare('SELECT * FROM partners WHERE id = ?')
        .get(partnerId) as PartnerRow | undefined;

      if (!partnerRow) {
        throw new RepositoryErrorException({ kind: 'NotFound', entity: 'partner', id: partnerId });
      }

      this.db
        .prepare(`UPDATE partners SET status = 'inactive', updated_at = ?, updated_by = ? WHERE id = ?`)
        .run(now, partnerRow.updated_by, partnerId);

      this.insertAuditEntry({
        entity: 'partner',
        entityId: partnerId,
        action: 'deactivate',
        actorSub: partnerRow.updated_by,
        actorName: actorName ?? partnerRow.updated_by,
        diff: diffOf({ status: { from: 'active', to: 'inactive' } }),
        at: now,
      });

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async activatePartner(partnerId: string, actorName?: string): Promise<void> {
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      const partnerRow = this.db
        .prepare('SELECT * FROM partners WHERE id = ?')
        .get(partnerId) as PartnerRow | undefined;

      if (!partnerRow) {
        throw new RepositoryErrorException({ kind: 'NotFound', entity: 'partner', id: partnerId });
      }

      this.db
        .prepare(`UPDATE partners SET status = 'active', updated_at = ?, updated_by = ? WHERE id = ?`)
        .run(now, partnerRow.updated_by, partnerId);

      this.insertAuditEntry({
        entity: 'partner',
        entityId: partnerId,
        action: 'activate',
        actorSub: partnerRow.updated_by,
        actorName: actorName ?? partnerRow.updated_by,
        diff: diffOf({ status: { from: 'inactive', to: 'active' } }),
        at: now,
      });

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async listAuditLog(query: AuditQuery): Promise<AuditEntry[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query.entityId) {
      conditions.push('entity_id = ?');
      params.push(query.entityId);
    }
    if (query.actorSub) {
      conditions.push('actor_sub = ?');
      params.push(query.actorSub);
    }
    if (query.from) {
      conditions.push('at >= ?');
      params.push(query.from);
    }
    if (query.to) {
      conditions.push('at <= ?');
      params.push(query.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const rows = this.db
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as AuditRow[];

    return rows.map(rowToAuditEntry);
  }

  async appendAccessDenied(event: { actorSub: string; actorName: string; attemptedSlug: string }): Promise<void> {
    this.insertAuditEntry({
      entity: 'access',
      entityId: event.attemptedSlug,
      action: 'cross_partner_denied',
      actorSub: event.actorSub,
      actorName: event.actorName,
    });
  }
}
