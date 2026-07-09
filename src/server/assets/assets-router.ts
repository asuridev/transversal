import { Router, type Request, type Response, type NextFunction } from 'express';

import type { AssetStorage } from './asset-storage.ts';

/**
 * Sirve `GET /assets/:key` desde el backend de assets (seam `AssetStorage`). Es la
 * cara de lectura del contrato estable `/assets/<key>`: hoy lee bytes del filesystem;
 * migrar a nube solo cambia el adaptador (o el handler hará `302` a la URL CDN).
 */
export function createAssetsRouter(assetStorage: AssetStorage): Router {
  const router = Router();

  router.get('/:key', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const asset = await assetStorage.get(String(req.params['key']));
      if (asset === null) {
        res.status(404).end();
        return;
      }

      res.setHeader('Content-Type', asset.mimeType);
      // El key es estable por partner+slot (`<partnerId>-<slot>.<ext>`): la URL no
      // cambia al re-subir, así que no se puede cachear como `immutable` o el
      // navegador/CDN seguiría sirviendo los bytes viejos. `no-cache` obliga a
      // revalidar ⇒ la nueva imagen se ve de inmediato bajo la misma URL.
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Defensa en profundidad para SVG servido inline (además de la sanitización de subida).
      if (asset.mimeType === 'image/svg+xml') {
        res.setHeader('Content-Security-Policy', "default-src 'none'");
      }
      res.status(200).end(Buffer.from(asset.bytes));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
