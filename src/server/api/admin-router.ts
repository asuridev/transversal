import { Router, type Request, type Response, type NextFunction } from 'express';

import { RepositoryErrorException, type PartnerRepository } from '../persistence/partner-repository.ts';
import type { SecretResolver } from '../secrets/secret-resolver.ts';
import type { AdminAuthGuard, AdminSession } from '../security/admin-auth-guard.ts';
import type { AssetStorage } from '../assets/asset-storage.ts';
import { validateBrandAsset } from '../assets/asset-validation.ts';
import { sanitizeSvg } from '../assets/svg-sanitize.ts';
import { validateNewPartnerSlug } from '../persistence/slug-validation.ts';
import { isValidPartnerKey } from '../../shared/partner/partner-key.ts';
import { createApiError, httpStatusForCode } from '../http/api-error.ts';
import { isPlainObjectBody } from '../http/validation.ts';
import { getDefaultPublicTheme } from '../../shared/partner/default-public-theme.ts';
import { requireRole } from '../security/require-role.ts';
import { requireCsrf } from '../security/csrf.ts';
import { isAssetSlotSlug } from '../../shared/partner/asset-slots.ts';

const READ_ROLES = ['platform-admin', 'partner-editor', 'auditor'] as const;
const AUDIT_ROLES = ['platform-admin', 'auditor'] as const;
const MUTATION_ROLES = ['platform-admin', 'partner-editor'] as const;

/** Extensión del key derivada del MIME ya validado (`validateBrandAsset`). */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'font/woff2': 'woff2',
};

function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'bin';
}

/** `partnerId` es un UUID (fuente del key `<partnerId>-<slot>.<ext>`): se valida el
 * formato para evitar caracteres inesperados en el nombre de archivo (defensa en
 * profundidad además de `safePath`). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminRouterDeps {
  readonly partnerRepository: PartnerRepository;
  readonly secretResolver: SecretResolver;
  readonly adminAuthGuard: AdminAuthGuard;
  readonly assetStorage: AssetStorage;
}

declare module 'express-serve-static-core' {
  interface Request {
    adminSession?: AdminSession;
  }
}

async function requireAdminSession(guard: AdminAuthGuard, req: Request, res: Response): Promise<boolean> {
  try {
    req.adminSession = await guard.authorize({ headers: req.headers as Record<string, string | string[] | undefined> });
    return true;
  } catch {
    const apiError = createApiError('unauthorized', 'No autorizado', req.requestId);
    res.status(httpStatusForCode('unauthorized')).json(apiError);
    return false;
  }
}

/** `/admin/*` — protegido por `adminAuthGuard` (default-deny V1, FR-015/016/017/018). */
export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router();

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    if (await requireAdminSession(deps.adminAuthGuard, req, res)) {
      next();
    }
  });

  router.get('/partners', requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    const status = req.query['status'] as 'active' | 'inactive' | undefined;
    const partners = await deps.partnerRepository.listPartners({ status });
    const dtos = await Promise.all(
      partners.map(async (partner) => {
        const currentTheme = partner.themeId ? await deps.partnerRepository.getThemeById(partner.themeId) : null;
        return {
          id: partner.id,
          slug: partner.slug,
          displayName: partner.displayName,
          status: partner.status,
          credentialConfigured: await deps.secretResolver.isConfigured(partner.slug),
          currentVersion: currentTheme?.version ?? null,
          updatedAt: partner.updatedAt,
          updatedBy: partner.updatedBy,
        };
      }),
    );
    res.status(200).json(dtos);
  });

  router.get('/partners/:id', requireRole(...READ_ROLES), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const partner = await deps.partnerRepository.findById(String(req.params['id']));
      if (!partner) {
        const apiError = createApiError('not_found', 'Partner no encontrado', req.requestId);
        res.status(httpStatusForCode('not_found')).json(apiError);
        return;
      }

      const [publishedTheme, draftTheme] = await Promise.all([
        partner.themeId ? deps.partnerRepository.getThemeById(partner.themeId) : Promise.resolve(null),
        deps.partnerRepository.getLatestDraftTheme(partner.id),
      ]);

      res.status(200).json({
        id: partner.id,
        slug: partner.slug,
        displayName: partner.displayName,
        status: partner.status,
        publishedTheme,
        draftTheme,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/partners', requireCsrf(), requireRole(...MUTATION_ROLES), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isPlainObjectBody(req.body)) {
        const apiError = createApiError('invalid_input', 'Body inválido', req.requestId, { field: 'body' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      const slugResult = validateNewPartnerSlug(String(req.body['slug'] ?? ''));
      if (!slugResult.ok) {
        const apiError = createApiError('invalid_input', 'Slug inválido', req.requestId, { field: 'slug' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      const partnerKey = String(req.body['partnerKey'] ?? '').trim();
      if (!isValidPartnerKey(partnerKey)) {
        const apiError = createApiError('invalid_input', 'partnerKey inválido', req.requestId, { field: 'partnerKey' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      const createdBy = req.adminSession?.subject ?? 'unknown';
      const defaultTheme = getDefaultPublicTheme();
      const firstTheme = (req.body['firstTheme'] as
        | { tokens: unknown; assets: unknown; legal: unknown; typography: unknown }
        | undefined) ?? {
        tokens: defaultTheme.tokens,
        assets: defaultTheme.assets,
        legal: defaultTheme.legal,
        typography: defaultTheme.typography,
      };

      const { partner, theme } = await deps.partnerRepository.createPartner(
        {
          slug: slugResult.slug,
          partnerKey,
          displayName: String(req.body['displayName'] ?? ''),
          createdBy,
        },
        { ...firstTheme, createdBy } as never,
        req.adminSession?.name,
      );

      res.status(201).json({ partner, theme });
    } catch (err) {
      if (err instanceof RepositoryErrorException && err.error.kind === 'UniquePartnerKey') {
        const apiError = createApiError('invalid_input', 'El partnerKey ya está en uso', req.requestId, {
          field: 'partnerKey',
        });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }
      next(err);
    }
  });

  router.patch('/partners/:id', requireCsrf(), requireRole(...MUTATION_ROLES), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isPlainObjectBody(req.body)) {
        const apiError = createApiError('invalid_input', 'Body inválido', req.requestId, { field: 'body' });
        res.status(httpStatusForCode('invalid_input')).json(apiError);
        return;
      }

      const theme = await deps.partnerRepository.saveThemeVersion(
        String(req.params['id']),
        {
          ...(req.body as Record<string, unknown>),
          createdBy: req.adminSession?.subject ?? 'unknown',
        } as never,
        req.adminSession?.name,
      );

      res.status(200).json(theme);
    } catch (err) {
      next(err);
    }
  });

  router.post('/partners/:id/publish', requireCsrf(), requireRole(...MUTATION_ROLES), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const themeId = String((req.body as Record<string, unknown> | undefined)?.['themeId'] ?? '');
      await deps.partnerRepository.publishThemeVersion(String(req.params['id']), themeId, req.adminSession?.name);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/partners/:id/deactivate', requireCsrf(), requireRole(...MUTATION_ROLES), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deps.partnerRepository.deactivatePartner(String(req.params['id']), req.adminSession?.name);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/partners/:id/activate', requireCsrf(), requireRole(...MUTATION_ROLES), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deps.partnerRepository.activatePartner(String(req.params['id']), req.adminSession?.name);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/assets', requireCsrf(), requireRole(...MUTATION_ROLES), async (req: Request, res: Response) => {
    if (!isPlainObjectBody(req.body)) {
      const apiError = createApiError('invalid_input', 'Body inválido', req.requestId, { field: 'body' });
      res.status(httpStatusForCode('invalid_input')).json(apiError);
      return;
    }

    const mimeType = String(req.body['mimeType'] ?? '');
    const base64 = String(req.body['base64'] ?? '');
    const partnerId = String(req.body['partnerId'] ?? '');
    const slot = req.body['slot'];
    const bytes = Buffer.from(base64, 'base64');

    // El key se compone de `partnerId` + `slot` (FR: nombre estable por partner):
    // ambos deben ser válidos antes de tocar el storage.
    if (!UUID_RE.test(partnerId)) {
      const apiError = createApiError('invalid_input', 'partnerId inválido', req.requestId, { field: 'partnerId' });
      res.status(httpStatusForCode('invalid_input')).json(apiError);
      return;
    }
    if (!isAssetSlotSlug(slot)) {
      const apiError = createApiError('invalid_input', 'slot inválido', req.requestId, { field: 'slot' });
      res.status(httpStatusForCode('invalid_input')).json(apiError);
      return;
    }

    const validation = validateBrandAsset({ mimeType, sizeBytes: bytes.byteLength });
    if (!validation.ok) {
      const apiError = createApiError('invalid_input', 'Asset inválido', req.requestId, {
        field: 'asset',
        reason: validation.error.kind,
      });
      res.status(httpStatusForCode('invalid_input')).json(apiError);
      return;
    }

    const finalBytes = mimeType === 'image/svg+xml' ? Buffer.from(sanitizeSvg(bytes.toString('utf-8'))) : bytes;
    // Key derivado server-side (no el del cliente): nombre estable `<partnerId>-<slot>.<ext>`,
    // así re-subir el mismo slot sobrescribe el archivo. `partnerId`(UUID)/`slot`(allowlist)
    // ya validados ⇒ sin caracteres de path traversal (`safePath` sigue como defensa extra).
    const key = `${partnerId}-${slot}.${extensionForMime(mimeType)}`;
    const ref = await deps.assetStorage.put({ key, mimeType, bytes: finalBytes });

    res.status(201).json(ref);
  });

  router.get('/audit', requireRole(...AUDIT_ROLES), async (req: Request, res: Response) => {
    const entityId = (req.query['partnerId'] ?? req.query['entityId']) as string | undefined;
    const actorSub = (req.query['actor'] ?? req.query['actorSub']) as string | undefined;
    const from = req.query['from'] as string | undefined;
    const to = req.query['to'] as string | undefined;
    const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;
    const offset = req.query['offset'] ? Number(req.query['offset']) : undefined;

    const entries = await deps.partnerRepository.listAuditLog({ entityId, actorSub, from, to, limit, offset });
    res.status(200).json(entries);
  });

  return router;
}
