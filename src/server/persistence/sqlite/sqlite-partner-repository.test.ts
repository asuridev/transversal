import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { runPartnerRepositoryContract } from '../partner-repository.contract-test.ts';
import { SqlitePartnerRepository } from './sqlite-partner-repository.ts';
import { popularThemeFixture } from '../__fixtures__/brands.ts';

runPartnerRepositoryContract(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'partner-repo-'));
  return new SqlitePartnerRepository(join(dir, 'partners.db'));
});

function makeRepo(): SqlitePartnerRepository {
  const dir = mkdtempSync(join(tmpdir(), 'partner-repo-audit-'));
  return new SqlitePartnerRepository(join(dir, 'partners.db'));
}

test('SqlitePartnerRepository — auditoría enriquecida (D8/D9, US3)', async (t) => {
  await t.test('P1: create ⇒ 1 entrada con actorName/diff correctos', async () => {
    const repo = makeRepo();
    const { partner } = await repo.createPartner(
      { slug: 'con-nombre', displayName: 'Con Nombre', createdBy: 'u-1', partnerKey: randomUUID() },
      popularThemeFixture,
      'Ana Pérez',
    );

    const entries = await repo.listAuditLog({});
    const created = entries.find((e) => e.entity === 'partner' && e.entityId === partner.id);
    assert.ok(created);
    assert.equal(created?.action, 'create');
    assert.equal(created?.actorSub, 'u-1');
    assert.equal(created?.actorName, 'Ana Pérez');
    assert.ok(created?.diff?.includes('con-nombre'));
  });

  await t.test('P2: publish ⇒ themeVersion = versión publicada + diff status draft→published', async () => {
    const repo = makeRepo();
    const { partner, theme } = await repo.createPartner(
      { slug: 'publish-version', displayName: 'Publish Version', createdBy: 'u-1', partnerKey: randomUUID() },
      popularThemeFixture,
    );

    await repo.publishThemeVersion(partner.id, theme.id, 'Beto Editor');

    const entries = await repo.listAuditLog({});
    const publish = entries.find((e) => e.action === 'publish' && e.entityId === partner.id);
    assert.ok(publish);
    assert.equal(publish?.themeVersion, theme.version);
    assert.equal(publish?.actorName, 'Beto Editor');
    assert.deepEqual(JSON.parse(publish!.diff!), { status: { from: 'draft', to: 'published' } });
  });

  await t.test('P3: update (saveThemeVersion) ⇒ themeVersion = nueva versión + diff de campos cambiados', async () => {
    const repo = makeRepo();
    const { partner } = await repo.createPartner(
      { slug: 'update-diff', displayName: 'Update Diff', createdBy: 'u-1', partnerKey: randomUUID() },
      popularThemeFixture,
    );

    const v2 = await repo.saveThemeVersion(
      partner.id,
      { ...popularThemeFixture, tokens: { ...popularThemeFixture.tokens, colorPrimary: '#ABCDEF' }, createdBy: 'u-1' },
      'Ana Pérez',
    );

    const entries = await repo.listAuditLog({});
    const updated = entries.find((e) => e.action === 'update' && e.entityId === v2.id);
    assert.ok(updated);
    assert.equal(updated?.themeVersion, 2);
    assert.equal(updated?.actorName, 'Ana Pérez');
    const diff = JSON.parse(updated!.diff!);
    assert.ok('tokens' in diff);
  });

  await t.test('P4: exactamente 1 entrada por mutación efectiva (SC-005)', async () => {
    const repo = makeRepo();
    const before = (await repo.listAuditLog({})).length;
    await repo.createPartner(
      { slug: 'una-entrada', displayName: 'Una Entrada', createdBy: 'u-1', partnerKey: randomUUID() },
      popularThemeFixture,
    );
    const after = (await repo.listAuditLog({})).length;
    assert.equal(after - before, 1);
  });

  await t.test('P5: mutación revertida (partner inexistente) ⇒ sin entrada de auditoría (FR-010)', async () => {
    const repo = makeRepo();
    const before = (await repo.listAuditLog({})).length;
    await assert.rejects(() => repo.saveThemeVersion('no-existe', popularThemeFixture));
    const after = (await repo.listAuditLog({})).length;
    assert.equal(after, before);
  });

  await t.test('P6: append-only — el puerto no expone ningún método de update/delete sobre audit_log', async () => {
    const repo = makeRepo();
    const methods = Object.keys(Object.getPrototypeOf(repo));
    const mutators = methods.filter((m) => /audit/i.test(m) && !/list/i.test(m));
    assert.deepEqual(mutators, []);
  });

  await t.test('P7: filas históricas sin actor_name ⇒ actorName cae a actorSub (compatibilidad)', async () => {
    const repo = makeRepo();
    const { partner } = await repo.createPartner(
      { slug: 'historico', displayName: 'Historico', createdBy: 'legacy-user', partnerKey: randomUUID() },
      popularThemeFixture,
    );
    // Simula una fila histórica sin actor_name (pre-006) escribiendo directamente.
    const db = (repo as unknown as { db: { exec(sql: string): void } }).db;
    db.exec(
      `UPDATE audit_log SET actor_name = NULL WHERE entity_id = '${partner.id}'`,
    );

    const entries = await repo.listAuditLog({});
    const entry = entries.find((e) => e.entityId === partner.id);
    assert.equal(entry?.actorName, 'legacy-user');
  });
});

test('SqlitePartnerRepository — auditoría de acceso cruzado (007, D5)', async (t) => {
  await t.test('P1: appendAccessDenied ⇒ exactamente 1 fila entity:access/action:cross_partner_denied', async () => {
    const repo = makeRepo();
    await repo.appendAccessDenied({ actorSub: 'u-asesor-a', actorName: 'Asesor A', attemptedSlug: 'banco-b' });

    const entries = await repo.listAuditLog({});
    const denied = entries.filter((e) => e.entity === 'access' && e.action === 'cross_partner_denied');
    assert.equal(denied.length, 1);
    assert.equal(denied[0]?.entityId, 'banco-b');
    assert.equal(denied[0]?.actorSub, 'u-asesor-a');
    assert.equal(denied[0]?.actorName, 'Asesor A');
  });

  await t.test('P2: append-only — no existe método de update/delete para el evento de acceso', async () => {
    const repo = makeRepo();
    const methods = Object.keys(Object.getPrototypeOf(repo));
    const mutators = methods.filter((m) => /access/i.test(m) && !/append/i.test(m));
    assert.deepEqual(mutators, []);
  });

  await t.test('P3: múltiples intentos de cruce generan múltiples filas independientes (sin sobrescritura)', async () => {
    const repo = makeRepo();
    await repo.appendAccessDenied({ actorSub: 'u-a', actorName: 'A', attemptedSlug: 'banco-b' });
    await repo.appendAccessDenied({ actorSub: 'u-a', actorName: 'A', attemptedSlug: 'banco-c' });

    const entries = await repo.listAuditLog({});
    const denied = entries.filter((e) => e.entity === 'access');
    assert.equal(denied.length, 2);
  });
});

test('SqlitePartnerRepository — migración de CHECK obsoleto en audit_log (007, bases pre-007)', async (t) => {
  await t.test('rebuild: base con CHECK antiguo pasa a admitir cross_partner_denied y preserva filas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'partner-repo-migrate-'));
    const dbPath = join(dir, 'partners.db');

    // (a) Simula una base pre-007: audit_log con el CHECK antiguo (sin 'access'
    // ni 'cross_partner_denied') y sin actor_name/theme_version, más una fila legada.
    const legacy = new SqlitePartnerRepository(dbPath);
    const legacyDb = (legacy as unknown as { db: { exec(sql: string): void; close(): void } }).db;
    legacyDb.exec('DROP TABLE audit_log;');
    legacyDb.exec(`CREATE TABLE audit_log (
      id         TEXT PRIMARY KEY,
      entity     TEXT NOT NULL CHECK (entity IN ('partner','partner_theme')),
      entity_id  TEXT NOT NULL,
      action     TEXT NOT NULL CHECK (action IN ('create','save_version','publish','deactivate')),
      actor_sub  TEXT NOT NULL,
      diff       TEXT,
      at         TEXT NOT NULL
    );`);
    legacyDb.exec(
      `INSERT INTO audit_log (id, entity, entity_id, action, actor_sub, diff, at)
       VALUES ('legacy-1','partner','p-legacy','create','u-legacy',NULL,'2025-01-01T00:00:00.000Z');`,
    );
    legacyDb.close();

    // (b) Reabrir la MISMA ruta ⇒ el constructor corre applySchemaMigrations ⇒ rebuild.
    const migrated = new SqlitePartnerRepository(dbPath);

    // (c) appendAccessDenied ahora inserta sin violar el CHECK (antes: 500).
    await migrated.appendAccessDenied({ actorSub: 'u-a', actorName: 'Asesor A', attemptedSlug: 'banco-b' });

    const entries = await migrated.listAuditLog({});
    const denied = entries.filter((e) => e.entity === 'access' && e.action === 'cross_partner_denied');
    assert.equal(denied.length, 1);
    assert.equal(denied[0]?.entityId, 'banco-b');

    // La fila legada sobrevive al rebuild.
    const survived = entries.find((e) => e.entityId === 'p-legacy');
    assert.ok(survived);
    assert.equal(survived?.action, 'create');
    assert.equal(survived?.actorSub, 'u-legacy');
  });

  await t.test('idempotente: reabrir una base ya migrada no altera ni duplica filas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'partner-repo-migrate-idem-'));
    const dbPath = join(dir, 'partners.db');

    const first = new SqlitePartnerRepository(dbPath);
    await first.appendAccessDenied({ actorSub: 'u-a', actorName: 'A', attemptedSlug: 'banco-b' });
    (first as unknown as { db: { close(): void } }).db.close();

    // Reabrir: la tabla ya tiene el CHECK vigente ⇒ rebuild no debe ejecutarse.
    const reopened = new SqlitePartnerRepository(dbPath);
    const entries = await reopened.listAuditLog({});
    const denied = entries.filter((e) => e.entity === 'access');
    assert.equal(denied.length, 1);
  });
});

test('SqlitePartnerRepository — filtros de auditoría (D9, US4)', async (t) => {
  await t.test('P1: filtro por entityId devuelve solo las entradas de ese partner', async () => {
    const repo = makeRepo();
    const { partner: a } = await repo.createPartner(
      { slug: 'filtro-a', displayName: 'Filtro A', createdBy: 'u-a', partnerKey: randomUUID() },
      popularThemeFixture,
    );
    const { partner: b } = await repo.createPartner(
      { slug: 'filtro-b', displayName: 'Filtro B', createdBy: 'u-b', partnerKey: randomUUID() },
      popularThemeFixture,
    );

    const entriesA = await repo.listAuditLog({ entityId: a.id });
    assert.ok(entriesA.every((e) => e.entityId === a.id));
    assert.ok(entriesA.length > 0);
    assert.ok(!entriesA.some((e) => e.entityId === b.id));
  });

  await t.test('P2: filtro por actorSub + rango de fechas combina con AND', async () => {
    const repo = makeRepo();
    const { partner } = await repo.createPartner(
      { slug: 'filtro-actor', displayName: 'Filtro Actor', createdBy: 'actor-x', partnerKey: randomUUID() },
      popularThemeFixture,
    );
    await repo.createPartner(
      { slug: 'filtro-otro-actor', displayName: 'Otro Actor', createdBy: 'actor-y', partnerKey: randomUUID() },
      popularThemeFixture,
    );

    const farFuture = new Date(Date.now() + 3_600_000).toISOString();
    const farPast = new Date(Date.now() - 3_600_000).toISOString();

    const filtered = await repo.listAuditLog({ actorSub: 'actor-x', from: farPast, to: farFuture });
    assert.ok(filtered.every((e) => e.actorSub === 'actor-x'));
    assert.ok(filtered.some((e) => e.entityId === partner.id));

    const outOfRange = await repo.listAuditLog({ actorSub: 'actor-x', from: farFuture });
    assert.deepEqual(outOfRange, []);
  });

  await t.test('P3: orden at DESC (más reciente primero)', async () => {
    const repo = makeRepo();
    await repo.createPartner(
      { slug: 'orden-desc', displayName: 'Orden Desc', createdBy: 'u-1', partnerKey: randomUUID() },
      popularThemeFixture,
    );

    const entries = await repo.listAuditLog({});
    const times = entries.map((e) => e.at);
    const sorted = [...times].sort().reverse();
    assert.deepEqual(times, sorted);
  });

  await t.test('P4: reconstrucción "marca vigente en fecha X" — última publish con at<=X da el themeVersion vigente', async () => {
    const repo = makeRepo();
    const { partner, theme: v1 } = await repo.createPartner(
      { slug: 'vigente-fecha', displayName: 'Vigente Fecha', createdBy: 'u-1', partnerKey: randomUUID() },
      popularThemeFixture,
    );
    await repo.publishThemeVersion(partner.id, v1.id);
    const v2 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'u-1' });

    const midpoint = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.publishThemeVersion(partner.id, v2.id);

    const asOfMidpoint = await repo.listAuditLog({ entityId: partner.id, to: midpoint });
    const lastPublishAtMidpoint = asOfMidpoint.find((e) => e.action === 'publish');
    assert.equal(lastPublishAtMidpoint?.themeVersion, v1.version);

    const asOfNow = await repo.listAuditLog({ entityId: partner.id });
    const lastPublishNow = asOfNow.find((e) => e.action === 'publish');
    assert.equal(lastPublishNow?.themeVersion, v2.version);
  });
});
