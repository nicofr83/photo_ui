import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { writeCacheAtomic } from '../../io/render_cache.ts';
import type { SafeFs } from '../../io/safe_fs.ts';
import { renderToJpeg } from '../../io/sips.ts';
import type { InFlightRenders } from '../images/in_flight_renders.ts';

export interface PageThumbDeps {
  readonly renderCacheRoot: string;
  readonly safeFs: SafeFs;
  readonly inFlight: InFlightRenders;
}

export interface PageThumbResult {
  readonly failure: 'SOURCE_FILE_MISSING' | null;
  readonly buffer: Buffer | null;
}

/**
 * Un `pageId` réel porte des `/` (`logbook/p010`) — jamais concaténé tel
 * quel dans un chemin de cache : tout caractère hors `[a-z0-9]` devient `_`,
 * ce qui exclut par construction un `..` ou un séparateur, sans avoir à les
 * lister un par un.
 */
export function sanitizePageId(pageId: string): string {
  return pageId.replace(/[^a-z0-9]/gi, '_');
}

export function pageThumbCachePath(renderCacheRoot: string, pageId: string, edge: number): string {
  return path.join(renderCacheRoot, 'pages', `${sanitizePageId(pageId)}-${String(edge)}.jpg`);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readIfPresent(target: string): Promise<Buffer | null> {
  try {
    return await readFile(target);
  } catch {
    return null;
  }
}

/**
 * Le scan ENTIER réduit, jamais rogné (`-Z edge`, `io/sips.ts` — même
 * rapport d'aspect, à la différence du hash perceptuel qui déforme
 * délibérément). Même mécanisme que `getRender` pour les photos
 * (`metier/images/image_service.ts`, tâche 15, §9.2) : cache sous
 * `RENDER_CACHE_ROOT/pages/<pageId sanitisé>-<edge>.jpg`, dédoublonné et
 * borné par le MÊME `InFlightRenders` que le processus entier — un
 * sémaphore par processus, jamais un de plus pour les pages.
 */
export async function getPageThumb(
  deps: PageThumbDeps, pageId: string, sourcePath: string, edge: number,
): Promise<PageThumbResult> {
  if (!await pathExists(sourcePath)) return { failure: 'SOURCE_FILE_MISSING', buffer: null };

  const cachePath = pageThumbCachePath(deps.renderCacheRoot, pageId, edge);
  const cached = await readIfPresent(cachePath);
  if (cached !== null) return { failure: null, buffer: cached };

  const buffer = await deps.inFlight.run(`page:${pageId}:${String(edge)}`, async () => {
    // Une requête qui a attendu le sémaphore trouve peut-être déjà le
    // rendu écrit par celle qui vient de le libérer.
    const already = await readIfPresent(cachePath);
    if (already !== null) return already;
    const jpeg = await renderToJpeg(sourcePath, edge);
    await writeCacheAtomic(deps.safeFs, cachePath, jpeg);
    return jpeg;
  });
  return { failure: null, buffer };
}
