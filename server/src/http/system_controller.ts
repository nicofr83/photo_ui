import { access } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import type { Pool } from '../db/pool.ts';
import type { Config } from '../runtime/config.ts';
import type { RootStatus, SystemStatus } from '../contract/system_interface.ts';

/**
 * Vérifiée EN DIRECT à chaque appel, jamais mise en cache depuis le démarrage :
 * le volume externe peut être démonté ou remonté PENDANT que le serveur tourne.
 */
async function checkRoot(name: RootStatus['name'], envVar: string, rootPath: string): Promise<RootStatus> {
  const available = await access(rootPath).then(() => true, () => false);
  return { name, envVar, path: rootPath, available, checkedAt: new Date().toISOString() };
}

export function registerSystemRoutes(server: FastifyInstance, deps: { pool: Pool; config: Config }): void {
  const { pool, config } = deps;

  server.get('/system/status', async (): Promise<SystemStatus> => {
    const roots = await Promise.all([
      checkRoot('originals', 'ORIGINALS_ROOT', config.originalsRoot),
      checkRoot('thumbs', 'THUMBS_ROOT', config.thumbsRoot),
      checkRoot('pages', 'PAGES_ROOT', config.pagesRoot),
      checkRoot('tasks', 'TASKS_ROOT', config.tasksRoot),
      checkRoot('render_cache', 'RENDER_CACHE_ROOT', config.renderCacheRoot),
    ]);

    const { rows: importRows } = await pool.query<{ import_id: string; finished_at: string }>(
      `SELECT import_id, finished_at FROM pipeline.import_run
        WHERE status = 'succeeded' ORDER BY finished_at DESC LIMIT 1`);
    const lastImport = importRows[0];

    const { rows: countRows } = await pool.query<{
      photos_in_hierarchy: number; photos_out_of_hierarchy: number; albums: number;
      documents: number; passages: number; log_entries: number;
    }>(`SELECT
          (SELECT count(DISTINCT p.cloud_asset_id)::int FROM pipeline.photo p
             JOIN pipeline.photo_album pa ON pa.cloud_asset_id = p.cloud_asset_id
             JOIN pipeline.album a ON a.path = pa.album_path AND a.in_perimeter)
            AS photos_in_hierarchy,
          (SELECT count(*)::int FROM pipeline.photo p
            WHERE NOT EXISTS (
              SELECT 1 FROM pipeline.photo_album pa JOIN pipeline.album a
                     ON a.path = pa.album_path AND a.in_perimeter
               WHERE pa.cloud_asset_id = p.cloud_asset_id))
            AS photos_out_of_hierarchy,
          (SELECT count(*)::int FROM pipeline.album)     AS albums,
          (SELECT count(*)::int FROM pipeline.document)  AS documents,
          (SELECT count(*)::int FROM pipeline.text_unit WHERE kind = 'passage')   AS passages,
          (SELECT count(*)::int FROM pipeline.text_unit WHERE kind = 'log_entry') AS log_entries`);
    const counts = countRows[0];

    return {
      importId: lastImport?.import_id ?? null,
      importedAt: lastImport?.finished_at ?? null,
      runningJobId: null,   // pas de système de job avant la tâche 19
      roots,
      counts: {
        photosInHierarchy: counts?.photos_in_hierarchy ?? 0,
        photosOutOfHierarchy: counts?.photos_out_of_hierarchy ?? 0,
        albums: counts?.albums ?? 0,
        documents: counts?.documents ?? 0,
        passages: counts?.passages ?? 0,
        logEntries: counts?.log_entries ?? 0,
      },
      // Ni la pré-construction ni le légendage n'existent encore (D9, hors plan actuel).
      prerender: { total: 0, done: 0, running: false },
      captions: { total: 0, done: 0, edited: 0, running: false },
    };
  });
}
