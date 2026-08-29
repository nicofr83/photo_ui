import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { createLog } from '../log/log.ts';
import { loadConfig } from '../runtime/config.ts';
import { createPool } from '../db/pool.ts';
import { withTransaction } from '../db/transaction.ts';
import { decodeBmp24 } from '../io/bmp_decode.ts';
import { mapWithConcurrency } from '../io/concurrency.ts';
import { resizeToBmp } from '../io/sips.ts';
import { decodeCp1252 } from '../metier/gallery/cp1252.ts';
import { surfaceAverageHash } from '../metier/gallery/dhash.ts';
import { dedupeByLinkKey, findBestMatch, isConfidentMatch } from '../metier/gallery/gallery_match.ts';
import { extractGalleryImages } from '../metier/gallery/read_gallery_html.ts';
import { writeGalleryLinks, type GalleryLinkRow } from '../repository/gallery_repository.ts';

/**
 * `npm run gallery:match`. Batch occasionnel, PAS l'import : n'écrit que
 * dans `app.web_gallery_link`, jamais dans `pipeline` — voir
 * `docs/spike-dhash-galeries.md` et le correctif du rang 3 pour la même
 * distinction entre ce qui vient d'amont et ce qu'on calcule ici.
 */
const config = loadConfig(process.env);
const log = createLog(config.logLevel);
const pool = createPool(config.databaseUrl);

const THEME_DIRS = new Set(['_derived', '_overlay', '_themes', '_fpclass', '_borders']);

async function hashFile(filePath: string): Promise<bigint | null> {
  try {
    return surfaceAverageHash(decodeBmp24(await resizeToBmp(filePath, 72, 64)));
  } catch (error) {
    log.warn('hachage impossible', { filePath, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function listHtmlPages(root: string): Promise<string[]> {
  const pages: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!THEME_DIRS.has(entry.name)) await walk(path.join(dir, entry.name));
      } else if (/\.html?$/i.test(entry.name)) {
        pages.push(path.join(dir, entry.name));
      }
    }
  }
  await walk(root);
  return pages;
}

interface GalleryEntry {
  readonly page: string;
  readonly imagePath: string;
  readonly caption: string | null;
  readonly alt: string | null;
}

try {
  log.info('hachage de la bibliothèque — départ');
  const thumbFiles = (await readdir(config.thumbsRoot)).filter((f) => f.toLowerCase().endsWith('.jpg'));
  const libraryHashes = await mapWithConcurrency(thumbFiles, config.renderConcurrency, (file) =>
    hashFile(path.join(config.thumbsRoot, file)));
  const library = new Map<string, bigint>();
  for (const [index, hash] of libraryHashes.entries()) {
    if (hash !== null) library.set((thumbFiles[index] as string).replace(/\.jpg$/i, ''), hash);
  }
  log.info('bibliothèque hachée', { total: thumbFiles.length, réussis: library.size });

  log.info('extraction des galeries — départ');
  const pages = await listHtmlPages(config.webGalleryRoot);
  const galleryEntries: GalleryEntry[] = [];
  for (const pagePath of pages) {
    const html = decodeCp1252(await readFile(pagePath));
    const page = path.relative(config.webGalleryRoot, pagePath);
    for (const image of extractGalleryImages(html)) {
      galleryEntries.push({ page, imagePath: image.imagePath, caption: image.caption, alt: image.alt });
    }
  }
  log.info('galeries extraites', { pages: pages.length, images: galleryEntries.length });

  log.info('hachage des images de galerie — départ');
  const galleryHashes = await mapWithConcurrency(galleryEntries, config.renderConcurrency, (entry) =>
    hashFile(path.join(config.webGalleryRoot, path.dirname(entry.page), entry.imagePath)));

  const links: GalleryLinkRow[] = [];
  let noFile = 0, noMatch = 0;
  for (const [index, entry] of galleryEntries.entries()) {
    const hash = galleryHashes[index];
    if (hash === null || hash === undefined) { noFile++; continue; }
    const match = findBestMatch(hash, library);
    if (match === null || !isConfidentMatch(match)) { noMatch++; continue; }
    links.push({
      sha256: match.sha256, page: entry.page, imagePath: entry.imagePath,
      caption: entry.caption, alt: entry.alt, distance: match.distance, margin: match.margin,
    });
  }
  const deduped = dedupeByLinkKey(links);
  log.info('appariement terminé', {
    images: galleryEntries.length, appariées: links.length, aprèsDédoublonnage: deduped.length,
    avecLégende: deduped.filter((l) => l.caption !== null).length, sansFichier: noFile, sansAppariement: noMatch,
  });

  const written = await withTransaction(pool, (client) => writeGalleryLinks(client, deduped));
  log.info('liens écrits dans app.web_gallery_link', { count: written });
} finally {
  await pool.end();
}
