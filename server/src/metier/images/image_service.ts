import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { SafeFs } from '../../io/safe_fs.ts';
import { renderToJpeg } from '../../io/sips.ts';
import { classifyRenderFailure, type RenderFailure } from './render_availability.ts';
import { thumbPath } from './thumb_path.ts';
import type { InFlightRenders } from './in_flight_renders.ts';

export interface ImageSource {
  readonly relativePath: string;
  readonly format: string;
}

export interface ImageResult {
  readonly failure: RenderFailure | null;
  readonly buffer: Buffer | null;
}

export interface ImageServiceDeps {
  readonly thumbsRoot: string;
  readonly originalsRoot: string;
  readonly renderCacheRoot: string;
  readonly safeFs: SafeFs;
  readonly inFlight: InFlightRenders;
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

/** Le rendu va dans un temporaire du MÊME dossier puis `rename` (tâche 15, §9.2). */
async function writeCacheAtomic(safeFs: SafeFs, targetPath: string, data: Buffer): Promise<void> {
  const dir = path.dirname(targetPath);
  await safeFs.mkdir(dir);
  const tmpPath = path.join(dir, `.tmp-${randomUUID()}-${path.basename(targetPath)}`);
  await safeFs.writeFile(tmpPath, data);
  await safeFs.rename(tmpPath, targetPath);
}

/**
 * `THUMBS_ROOT` est un artefact PRÉ-GÉNÉRÉ par le pipeline amont, en lecture
 * seule — servir une vignette n'écrit jamais rien, contrairement à `getRender`.
 */
export async function getThumb(
  deps: ImageServiceDeps, sha256: string, photo: ImageSource,
): Promise<ImageResult> {
  const rootMounted = await pathExists(deps.thumbsRoot);
  const filePath = path.join(deps.thumbsRoot, thumbPath(sha256));
  const fileExists = rootMounted && await pathExists(filePath);
  const failure = classifyRenderFailure({ rootMounted, fileExists, format: photo.format });
  if (failure !== null) return { failure, buffer: null };
  return { failure: null, buffer: await readFile(filePath) };
}

/**
 * Le rendu au bord `edge` : servi depuis `RENDER_CACHE_ROOT` s'il y est déjà,
 * sinon calculé UNE fois par clé — `deps.inFlight` dédoublonne les requêtes
 * concurrentes et borne le nombre de `sips` simultanés (sémaphore de 8).
 */
export async function getRender(
  deps: ImageServiceDeps, sha256: string, photo: ImageSource, edge: number,
): Promise<ImageResult> {
  const rootMounted = await pathExists(deps.originalsRoot);
  const sourcePath = path.join(deps.originalsRoot, photo.relativePath);
  const fileExists = rootMounted && await pathExists(sourcePath);
  const failure = classifyRenderFailure({ rootMounted, fileExists, format: photo.format });
  if (failure !== null) return { failure, buffer: null };

  const cachePath = path.join(deps.renderCacheRoot, String(edge), thumbPath(sha256));
  const cached = await readIfPresent(cachePath);
  if (cached !== null) return { failure: null, buffer: cached };

  const buffer = await deps.inFlight.run(`${sha256}:${String(edge)}`, async () => {
    // Une requête qui a attendu le sémaphore trouve peut-être déjà le rendu
    // écrit par celle qui vient de le libérer.
    const already = await readIfPresent(cachePath);
    if (already !== null) return already;
    const jpeg = await renderToJpeg(sourcePath, edge);
    await writeCacheAtomic(deps.safeFs, cachePath, jpeg);
    return jpeg;
  });
  return { failure: null, buffer };
}
