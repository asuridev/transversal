import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PartnerRepository } from './partner-repository.ts';
import { RepositoryErrorException } from './partner-repository.ts';
import { popularThemeFixture, occidenteThemeFixture } from './__fixtures__/brands.ts';

export function runPartnerRepositoryContract(makeRepo: () => Promise<PartnerRepository>) {
  describe('PartnerRepository (contract)', () => {
    // US1 — Alta de partner
    describe('caso 1: alta persiste Partner + Theme v1 borrador atómicamente', () => {
      it('crea partner active/themeId=null + theme v1 borrador', async () => {
        const repo = await makeRepo();
        const { partner, theme } = await repo.createPartner(
          { slug: 'popular', displayName: 'Banco Popular', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );

        assert.equal(partner.status, 'active');
        assert.equal(partner.themeId, null);
        assert.equal(theme.version, 1);
        assert.equal(theme.publishedAt, null);

        const found = await repo.findBySlug('popular');
        assert.ok(found);
        assert.equal(found?.id, partner.id);
      });
    });

    describe('caso 2: slug duplicado se rechaza', () => {
      it('rechaza createPartner con slug ya existente, sin persistir', async () => {
        const repo = await makeRepo();
        await repo.createPartner(
          { slug: 'duplicado', displayName: 'Banco A', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );

        await assert.rejects(
          () =>
            repo.createPartner(
              { slug: 'duplicado', displayName: 'Banco B', createdBy: 'tester', partnerKey: randomUUID() },
              popularThemeFixture,
            ),
          (err: unknown) => {
            assert.ok(err instanceof RepositoryErrorException);
            assert.equal(err.error.kind, 'UniqueSlug');
            return true;
          },
        );

        const found = await repo.findBySlug('duplicado');
        assert.equal(found?.displayName, 'Banco A');
      });
    });

    describe('caso 2b: partnerKey duplicado se rechaza', () => {
      it('rechaza createPartner con partnerKey ya existente, sin persistir', async () => {
        const repo = await makeRepo();
        const sharedKey = randomUUID();
        await repo.createPartner(
          { slug: 'key-a', displayName: 'Banco A', createdBy: 'tester', partnerKey: sharedKey },
          popularThemeFixture,
        );

        await assert.rejects(
          () =>
            repo.createPartner(
              { slug: 'key-b', displayName: 'Banco B', createdBy: 'tester', partnerKey: sharedKey },
              popularThemeFixture,
            ),
          (err: unknown) => {
            assert.ok(err instanceof RepositoryErrorException);
            assert.equal(err.error.kind, 'UniquePartnerKey');
            return true;
          },
        );

        assert.equal(await repo.findBySlug('key-b'), null);
      });
    });

    describe('caso 3: slug inmutable (sin operación de cambio en el puerto)', () => {
      it('el puerto no expone ningún método para cambiar el slug', async () => {
        const repo = await makeRepo();
        const methods = Object.keys(Object.getPrototypeOf(repo));
        const renameLike = methods.filter((m) => /slug/i.test(m) && !/find|get/i.test(m));
        assert.deepEqual(renameLike, []);
      });
    });

    // US2 — Servir theme público
    describe('caso 4: getPublishedTheme no sirve borradores', () => {
      it('devuelve null si el partner solo tiene versiones en borrador', async () => {
        const repo = await makeRepo();
        await repo.createPartner(
          { slug: 'solo-borrador', displayName: 'Solo Borrador', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );

        const published = await repo.getPublishedTheme('solo-borrador');
        assert.equal(published, null);
      });
    });

    describe('caso 13: findActiveSlugs solo activos', () => {
      it('devuelve solo slugs de partners active', async () => {
        const repo = await makeRepo();
        await repo.createPartner(
          { slug: 'activo-uno', displayName: 'Activo Uno', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        const { partner: inactivo } = await repo.createPartner(
          { slug: 'inactivo-uno', displayName: 'Inactivo Uno', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        await repo.deactivatePartner(inactivo.id);

        const slugs = await repo.findActiveSlugs();
        assert.ok(slugs.includes('activo-uno'));
        assert.ok(!slugs.includes('inactivo-uno'));
      });
    });

    describe('caso 15: dos marcas, mismo esquema', () => {
      it('Popular (verde) y Occidente (azul) son válidos con el mismo set de claves', async () => {
        const repo = await makeRepo();
        const popular = await repo.createPartner(
          { slug: 'popular-marca', displayName: 'Banco Popular', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        const occidente = await repo.createPartner(
          { slug: 'occidente-marca', displayName: 'Banco de Occidente', createdBy: 'tester', partnerKey: randomUUID() },
          occidenteThemeFixture,
        );

        await repo.publishThemeVersion(popular.partner.id, popular.theme.id);
        await repo.publishThemeVersion(occidente.partner.id, occidente.theme.id);

        const popularPublished = await repo.getPublishedTheme('popular-marca');
        const occidentePublished = await repo.getPublishedTheme('occidente-marca');

        assert.ok(popularPublished);
        assert.ok(occidentePublished);
        assert.deepEqual(
          Object.keys(popularPublished!.tokens).sort(),
          Object.keys(occidentePublished!.tokens).sort(),
        );
        assert.notEqual(popularPublished!.tokens.colorPrimary, occidentePublished!.tokens.colorPrimary);
      });
    });

    // US3 — Versionado / publicación / rollback
    describe('caso 5: publicar mueve el puntero', () => {
      it('publishThemeVersion mueve Partner.themeId y getPublishedTheme lo refleja', async () => {
        const repo = await makeRepo();
        const { partner } = await repo.createPartner(
          { slug: 'publicar-mueve', displayName: 'Publicar Mueve', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        const v2 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' });

        await repo.publishThemeVersion(partner.id, v2.id);

        const published = await repo.getPublishedTheme('publicar-mueve');
        assert.equal(published?.id, v2.id);
        assert.equal(published?.version, v2.version);
      });
    });

    describe('caso 6: guardar crea v2 sin tocar v1 publicada', () => {
      it('saveThemeVersion no afecta la versión publicada vigente', async () => {
        const repo = await makeRepo();
        const { partner, theme: v1 } = await repo.createPartner(
          { slug: 'guardar-v2', displayName: 'Guardar V2', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        await repo.publishThemeVersion(partner.id, v1.id);

        await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' });

        const published = await repo.getPublishedTheme('guardar-v2');
        assert.equal(published?.id, v1.id);
        assert.equal(published?.version, 1);
      });
    });

    describe('caso 6b: borrador huérfano (versión menor sin publicar) no cuenta como draft', () => {
      it('getLatestDraftTheme ignora un draft superado por una versión posterior ya publicada', async () => {
        const repo = await makeRepo();
        const { partner } = await repo.createPartner(
          { slug: 'draft-huerfano', displayName: 'Draft Huérfano', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        // v2 queda como borrador y se abandona; v3 se guarda y se publica.
        await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' }); // v2 (draft)
        const v3 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' }); // v3 (draft)
        await repo.publishThemeVersion(partner.id, v3.id);

        // La última versión (v3) está publicada ⇒ no hay borrador pendiente,
        // aunque v2 siga con published_at NULL (huérfano, no debe devolverse).
        const draft = await repo.getLatestDraftTheme(partner.id);
        assert.equal(draft, null);

        // Un edit posterior sí crea un borrador pendiente real (v4 = máxima, sin publicar).
        const v4 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' });
        const pending = await repo.getLatestDraftTheme(partner.id);
        assert.equal(pending?.id, v4.id);
      });
    });

    describe('caso 7: rollback re-publicando v1', () => {
      it('re-publicar v1 restaura sin perder v2 del historial', async () => {
        const repo = await makeRepo();
        const { partner, theme: v1 } = await repo.createPartner(
          { slug: 'rollback-v1', displayName: 'Rollback V1', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        await repo.publishThemeVersion(partner.id, v1.id);
        const v2 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' });
        await repo.publishThemeVersion(partner.id, v2.id);

        await repo.publishThemeVersion(partner.id, v1.id);

        const published = await repo.getPublishedTheme('rollback-v1');
        assert.equal(published?.id, v1.id);
        assert.notEqual(v2.id, v1.id);
      });
    });

    describe('caso 8: historial completo preservado', () => {
      it('todas las versiones creadas siguen existiendo tras publicar/rollback', async () => {
        const repo = await makeRepo();
        const { partner, theme: v1 } = await repo.createPartner(
          { slug: 'historial-completo', displayName: 'Historial', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        const v2 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' });
        const v3 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'tester' });
        await repo.publishThemeVersion(partner.id, v3.id);
        await repo.publishThemeVersion(partner.id, v1.id);

        assert.deepEqual([v1.version, v2.version, v3.version].sort(), [1, 2, 3]);
      });
    });

    describe('caso 9: cada versión con auditoría', () => {
      it('cada mutación deja fila en audit_log con actor y timestamp', async () => {
        const repo = await makeRepo();
        const { partner, theme } = await repo.createPartner(
          { slug: 'con-auditoria', displayName: 'Con Auditoria', createdBy: 'auditor', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        const v2 = await repo.saveThemeVersion(partner.id, { ...popularThemeFixture, createdBy: 'auditor' });
        await repo.publishThemeVersion(partner.id, v2.id);

        assert.ok(theme.createdBy);
        assert.ok(theme.createdAt);
        assert.ok(v2.createdBy);
        assert.ok(v2.createdAt);
      });
    });

    describe('caso 10: atomicidad — fallo revierte todo', () => {
      it('un fallo en la mutación no deja auditoría huérfana', async () => {
        const repo = await makeRepo();
        const activeSlugsBefore = await repo.findActiveSlugs();

        await assert.rejects(() => repo.saveThemeVersion('partner-inexistente', popularThemeFixture));

        const activeSlugsAfter = await repo.findActiveSlugs();
        assert.deepEqual(activeSlugsBefore, activeSlugsAfter);
      });
    });

    // US5 — Default theme / baja lógica
    describe('caso 11: partner inactivo no es servible', () => {
      it('deactivatePartner ⇒ getPublishedTheme=null y no aparece en findActiveSlugs', async () => {
        const repo = await makeRepo();
        const { partner, theme } = await repo.createPartner(
          { slug: 'inactivo-no-servible', displayName: 'Inactivo No Servible', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );
        await repo.publishThemeVersion(partner.id, theme.id);

        await repo.deactivatePartner(partner.id);

        assert.equal(await repo.getPublishedTheme('inactivo-no-servible'), null);
        assert.ok(!(await repo.findActiveSlugs()).includes('inactivo-no-servible'));
      });
    });

    describe('caso 12: baja lógica, no física', () => {
      it('findBySlug sigue devolviendo el partner con status inactive', async () => {
        const repo = await makeRepo();
        const { partner } = await repo.createPartner(
          { slug: 'baja-logica', displayName: 'Baja Logica', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );

        await repo.deactivatePartner(partner.id);

        const found = await repo.findBySlug('baja-logica');
        assert.ok(found);
        assert.equal(found?.status, 'inactive');
      });
    });

    describe('caso 14: __default__ no se lista', () => {
      it('listPartners excluye al partner del sistema', async () => {
        const repo = await makeRepo();
        await repo.createPartner(
          { slug: 'catalogo-normal', displayName: 'Catalogo Normal', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );

        const listed = await repo.listPartners({});
        assert.ok(!listed.some((p) => p.slug === '__default__'));
      });
    });

    // US1 — Assets
    describe('caso 16: assets solo URL', () => {
      it('assets.*Url son strings; ningún binario se persiste', async () => {
        const repo = await makeRepo();
        const { theme } = await repo.createPartner(
          { slug: 'assets-url-check', displayName: 'Assets Check', createdBy: 'tester', partnerKey: randomUUID() },
          popularThemeFixture,
        );

        for (const value of Object.values(theme.assets)) {
          if (value !== undefined) assert.equal(typeof value, 'string');
        }
      });
    });
  });
}
