import { realpath } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { createLog } from '../log/log.ts';
import { createPool, type Pool } from '../db/pool.ts';
import { createSafeFs } from '../io/safe_fs.ts';
import { registerSystemRoutes } from '../http/system_controller.ts';
import { buildServer } from './server.ts';
import { loadConfig } from './config.ts';

export interface App {
  readonly server: FastifyInstance;
  close(): Promise<void>;
}

/**
 * LE composition root — le seul module qui construit. Tout le reste reçoit
 * ses dépendances par constructeur ; aucun conteneur de DI (D2 du plan).
 *
 * Vérification des racines au démarrage (`docs/backend-spec.md` §3.2), et
 * l'exception qui compte : `ORIGINALS_ROOT`/`THUMBS_ROOT` peuvent manquer —
 * le volume externe se démonte en session — le serveur démarre quand même,
 * `GET /system/status` le dira. Toutes les autres racines refusent de
 * démarrer, en nommant la variable.
 */
export async function bootstrap(env: NodeJS.ProcessEnv): Promise<App> {
  const config = loadConfig(env);
  const log = createLog(config.logLevel);
  const pool: Pool = createPool(config.databaseUrl);

  // Racines INSCRIPTIBLES et racines EN LECTURE mais INDISPENSABLES (les
  // quatre bases amont, les pages scannées) : refusent toutes de démarrer,
  // contrairement à ORIGINALS_ROOT/THUMBS_ROOT plus bas. `createSafeFs` fait
  // ce contrôle lui-même pour les inscriptibles, mais son message ne nomme
  // que le CHEMIN, jamais la variable — on vérifie donc chacune ici d'abord,
  // pour un refus qui se corrige sans deviner quelle variable il vise.
  const requiredRoots: readonly (readonly [string, string])[] = [
    ['RENDER_CACHE_ROOT', config.renderCacheRoot], ['TASKS_ROOT', config.tasksRoot],
    ...(config.featureDatingExport ? [['ANNOTATIONS_DIR', config.annotationsDir] as const] : []),
    ['PIPELINE_DB_ROOT', config.pipelineDbRoot], ['PAGES_ROOT', config.pagesRoot],
  ];
  for (const [envVar, rootPath] of requiredRoots) {
    try {
      await realpath(rootPath);
    } catch {
      throw new Error(`${envVar} est introuvable : ${rootPath}`);
    }
  }

  await createSafeFs(config.writableRoots, log);

  const server = buildServer(log);
  registerSystemRoutes(server, { pool, config });
  await server.ready();

  log.info('serveur prêt', { host: config.host, port: config.port });

  return {
    server,
    async close(): Promise<void> {
      await server.close();
      await pool.end();
    },
  };
}
